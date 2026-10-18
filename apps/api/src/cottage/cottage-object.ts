import {
  type ChatListItem,
  CottageDelivery,
  CottageFarm,
  FarmNotifications,
  type CottageServerFrame,
  type MeSettings,
  MeSettingsUpdate,
  NotificationType,
  PING,
  PONG,
  PushJob,
  type QuickTendList,
  RegisterDeviceRequest,
  RememberRequest,
  type RememberSeed,
  type SocketErrorCode,
} from '@kithfield/contracts';
import { DurableObject } from 'cloudflare:workers';

import type { Bindings } from '../env';
import type { Decision } from '../push/policy';
import * as chats from './chats';
import { alarmDelay, nextAlarmAt, ringAlarm } from './alarm';
import { type Claim, claimJob } from './claim';
import { cottageClock } from './clock';
import * as devices from './devices';
import { decideDelivery, receiveDelivery } from './deliver';
import { answerHello } from './hello';
import { considerJob, type Intake } from './intake';
import * as merge from './merge';
import { applySettings, readProfile, updateProfile } from './profile';
import { quickTend } from './quick-tend';
import * as resting from './resting';
import { applySchema } from './schema';
import * as seeds from './seeds';
import * as sockets from './socket';
import { cottageOf } from './stub';

/**
 * One per person, named by their person id (`cottageOf` in `./stub`). It keeps the chat list and
 * what waits in Quick Tend, the person's settings and devices, the push budget and quiet hours,
 * and their remember-me seeds. The phone holds one socket to it; farms and the API call it.
 *
 * The farm object calls, per member: `deliver(CottageDelivery)` after each committed event;
 * `upsertFarm` on `joined`, a rename or a visit peer's change; `leaveFarm` on `left`/`removed`.
 */
export class CottageDO extends DurableObject<Bindings> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    applySchema(this.sql);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  private get person(): string {
    const name = this.ctx.id.name;
    if (name === undefined) throw new Error('A cottage is addressed by its person id');
    return name;
  }

  private get now(): number {
    return cottageClock.now();
  }

  private intake(): Intake {
    return { sql: this.sql, env: this.env, person: this.person, now: this.now };
  }

  /**
   * A farm committed an event: update the chat list and Quick Tend, tell the phone, and decide
   * whether to push. A repeated delivery does nothing; a late one (a slow post) still counts.
   */
  async deliver(delivery: CottageDelivery): Promise<void> {
    const parsed = CottageDelivery.parse(delivery);
    const intake = this.intake();
    if (!(await receiveDelivery(intake, parsed))) return;
    this.sendRow(parsed.farm, intake.now);
    await decideDelivery(intake, parsed);
    await this.scheduleAlarm();
  }

  /**
   * Takes in a merged person's cottage (`PersonMergedJob {from, into}`, called on `into`): their
   * chats, waiting items, devices, seeds and held pushes, their settings if this person has none,
   * and their action keys in D1; then empties theirs. Safe to run again.
   */
  async absorb(from: string): Promise<void> {
    if (from === this.person) return;
    const other = cottageOf(this.env, from);
    merge.mergeInto(this.sql, await other.exportForMerge(), this.person);
    await merge.moveActionKeys(this.env.DB, from, this.person);
    await other.clear();
    this.broadcast({ type: 'chats', chats: chats.chatList(this.sql, this.now) });
    await this.scheduleAlarm();
  }

  exportForMerge(): merge.CottageExport {
    return merge.exportCottage(this.sql);
  }

  /** Empties the cottage (merged away, or the account purged): sockets closed, storage gone. */
  async clear(): Promise<void> {
    this.closeSockets('unauthorized');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    applySchema(this.sql);
  }

  /** The person lives on this farm or visit: its kind, and its name or peer. */
  upsertFarm(info: CottageFarm): void {
    const parsed = CottageFarm.parse(info);
    chats.upsertFarm(this.sql, parsed);
    this.sendRow(parsed.farm, this.now);
  }

  /** The person left, or was removed: the farm leaves their chat list. */
  leaveFarm(farm: string): void {
    chats.removeFarm(this.sql, farm);
    this.broadcast({ type: 'chats', chats: chats.chatList(this.sql, this.now) });
  }

  /** From the farm after `PUT /v1/farms/:id/notifications`: the mute and the "Knock for" toggles. */
  setFarmNotifications(farm: string, settings: FarmNotifications): void {
    chats.setNotifications(this.sql, farm, FarmNotifications.parse(settings));
    this.sendRow(farm, this.now);
  }

  /** Pins a farm to the top of the chat list, or unpins it; false for a farm it doesn't know. */
  pinFarm(farm: string, pinned: boolean): boolean {
    if (!chats.knowsFarm(this.sql, farm)) return false;
    chats.setPinned(this.sql, farm, pinned);
    this.sendRow(farm, this.now);
    return true;
  }

  quickTend(): QuickTendList {
    return quickTend(this.sql);
  }

  /** The app opened a push (the id in its data); an unknown id is ignored. */
  pushOpened(id: string): void {
    resting.markOpened(this.sql, id);
  }

  /** The kinds of push resting on a farm after unopened ones, and until when. */
  restingOn(farm: string): { type: NotificationType; until: number }[] {
    return resting.restingOn(this.sql, farm, this.now);
  }

  wakeResting(farm: string, type: NotificationType): void {
    resting.wake(this.sql, farm, NotificationType.parse(type), this.now);
  }

  chatList(): ChatListItem[] {
    return chats.chatList(this.sql, this.now);
  }

  /** Everything waiting in Quick Tend, newest first. */
  waiting(): chats.WaitingItem[] {
    return chats.waitingItems(this.sql);
  }

  clearWaiting(farm: string): void {
    chats.clearWaiting(this.sql, farm);
    this.sendRow(farm, this.now);
  }

  /**
   * A push from another producer (a plan reminder, a wake-up nudge): the same rules as an event,
   * then queued. Producers never put jobs on the queue themselves.
   */
  async push(job: PushJob): Promise<Decision['action']> {
    const decision = await considerJob(this.intake(), PushJob.parse(job), false);
    await this.scheduleAlarm();
    return decision.action;
  }

  /** The push consumer's last check before sending. */
  async claim(job: PushJob): Promise<Claim> {
    const claim = claimJob(this.intake(), PushJob.parse(job));
    if (claim.action === 'hold') await this.scheduleAlarm();
    return claim;
  }

  /** Expo says this token is no longer registered. */
  dropPushToken(device: string, token: string): boolean {
    return devices.dropPushToken(this.sql, device, token);
  }

  registerDevice(device: string, request: RegisterDeviceRequest): void {
    devices.registerDevice(this.sql, device, RegisterDeviceRequest.parse(request), this.now);
  }

  listDevices(): devices.CottageDevice[] {
    return devices.listDevices(this.sql);
  }

  forgetDevice(device: string): void {
    devices.forgetDevice(this.sql, device);
  }

  /** For `GET /v1/me`; `zoneKnown` says whether the app has sent the person's time zone yet. */
  settings(): { settings: MeSettings; hibernating: boolean; zoneKnown: boolean } {
    const { settings, hibernating, zoneKnown } = readProfile(this.sql);
    return { settings, hibernating, zoneKnown };
  }

  /** Changes settings, the person's time zone among them. */
  updateSettings(update: MeSettingsUpdate): MeSettings {
    const parsed = MeSettingsUpdate.parse(update);
    return updateProfile(this.sql, (profile) => applySettings(profile, parsed)).settings;
  }

  /** Hibernating pauses every push and nudge. */
  setHibernating(on: boolean): void {
    updateProfile(this.sql, (profile) => ({ ...profile, hibernating: on }));
  }

  /* Remember-me seeds: personal, grow nothing, nudge once at `nudgeAt`. */

  async plantSeed(request: RememberRequest): Promise<string | null> {
    const id = seeds.plantSeed(this.sql, RememberRequest.parse(request), this.now);
    await this.scheduleAlarm();
    return id;
  }

  listSeeds(): RememberSeed[] {
    return seeds.listSeeds(this.sql);
  }

  async removeSeed(id: string): Promise<boolean> {
    const removed = seeds.removeSeed(this.sql, id);
    await this.scheduleAlarm();
    return removed;
  }

  /** A note from the safety team waits; the frame carries no content. */
  noteSafety(): void {
    updateProfile(this.sql, (profile) => ({ ...profile, safetyNote: true }));
    this.broadcast({ type: 'safety_note' });
  }

  clearSafetyNote(): void {
    updateProfile(this.sql, (profile) => ({ ...profile, safetyNote: false }));
  }

  /** Closes every socket, as on sign-out, a ban or deletion. */
  closeSockets(code: SocketErrorCode): void {
    for (const ws of this.ctx.getWebSockets()) sockets.refuse(ws, code);
  }

  /** Late hellos, held pushes and due seeds; after a failure, it rings again in a minute. */
  override async alarm(): Promise<void> {
    sockets.closeLate(this.ctx.getWebSockets(), this.now);
    if (await ringAlarm(this.intake())) await this.scheduleAlarm();
    else await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }

  /** Rings at the earliest thing due, as a delay from the cottage's clock. */
  private async scheduleAlarm(): Promise<void> {
    const at = nextAlarmAt(this.sql, this.ctx.getWebSockets());
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Date.now() + alarmDelay(at, this.now));
  }

  /* The cottage socket: `hello {protocol, token}` first, then `chats`, then a `chat` per change. */

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: { code: 'bad_request' } }, { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const deadline = this.now + sockets.HELLO_DEADLINE_MS;
    server.serializeAttachment({ authed: false, deadline } satisfies sockets.SocketState);
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await answerHello(ws, message, this.intake());
  }

  /** Completes the closing handshake; a socket already closed needs nothing. */
  override webSocketClose(ws: WebSocket, code: number): void {
    if (ws.readyState === WebSocket.OPEN) ws.close(code === 1005 || code === 1006 ? 1000 : code);
  }

  private sendRow(farm: string, now: number): void {
    const chat = chats.chatRow(this.sql, farm, now);
    if (chat !== null) this.broadcast({ type: 'chat', chat });
  }

  private broadcast(frame: CottageServerFrame): void {
    sockets.broadcast(this.ctx.getWebSockets(), frame);
  }
}
