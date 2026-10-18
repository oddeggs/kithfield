import {
  type ChatListItem,
  CottageDelivery,
  type CottageServerFrame,
  type MeSettings,
  MeSettingsUpdate,
  PING,
  PONG,
  PROTOCOL_VERSION,
  PushJob,
  RegisterDeviceRequest,
  RememberRequest,
  type RememberSeed,
  type SocketErrorCode,
  TimeZone,
} from '@kithfield/contracts';
import { DurableObject } from 'cloudflare:workers';

import type { Bindings } from '../env';
import type { Decision } from '../push/policy';
import { cottageAdapters } from './adapters';
import * as chats from './chats';
import { type Claim, claimJob, nextHeldAt, releaseHeld } from './claim';
import { cottageClock } from './clock';
import * as devices from './devices';
import { farmFromDirectory } from './directory';
import { considerDelivery, considerJob, type Intake, reminderJob } from './intake';
import { applySettings, readProfile, updateProfile } from './profile';
import { applySchema } from './schema';
import * as seeds from './seeds';
import * as sockets from './socket';

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

  private intake(): Intake {
    return { sql: this.sql, env: this.env, person: this.person, now: cottageClock.now() };
  }

  private get now(): number {
    return cottageClock.now();
  }

  /**
   * A farm committed an event: update the chat list and Quick Tend, tell the phone, and decide
   * whether to push. A repeated delivery does nothing; a late one (a slow post) still counts. A
   * farm the cottage wasn't told about is looked up, so a missed `upsertFarm` never hides a chat.
   */
  async deliver(delivery: CottageDelivery): Promise<void> {
    const parsed = CottageDelivery.parse(delivery);
    const intake = this.intake();
    if (!chats.knowsFarm(this.sql, parsed.farm)) {
      const info = await farmFromDirectory(this.env.DB, parsed.farm, intake.person);
      if (info !== null) chats.upsertFarm(this.sql, info);
    }
    if (!chats.applyDelivery(this.sql, parsed, intake.person, intake.now)) return;
    if (parsed.actor === intake.person && parsed.kind === 'farm_opened') this.cameBack();
    this.sendRow(parsed.farm, intake.now);
    try {
      await considerDelivery(intake, parsed);
    } catch (error) {
      // The farm retries a failed call: let that retry be taken rather than seen as a repeat.
      chats.forgetDelivered(this.sql, parsed.farm, parsed.seq);
      throw error;
    }
    await this.scheduleAlarm();
  }

  /** The person lives on this farm or visit: its kind, name or peer, and their pin. */
  upsertFarm(info: chats.CottageFarm): void {
    const parsed = chats.CottageFarm.parse(info);
    chats.upsertFarm(this.sql, parsed);
    this.sendRow(parsed.farm, this.now);
  }

  /** The person left, or was removed: the farm leaves their chat list. */
  leaveFarm(farm: string): void {
    chats.removeFarm(this.sql, farm);
    this.broadcast({ type: 'chats', chats: chats.chatList(this.sql, this.now) });
  }

  /** Mutes a farm until a time (null unmutes). Muted farms never push. */
  muteFarm(farm: string, until: number | null): void {
    chats.setMuted(this.sql, farm, until);
    this.sendRow(farm, this.now);
  }

  pinFarm(farm: string, pinned: boolean): void {
    chats.setPinned(this.sql, farm, pinned);
    this.sendRow(farm, this.now);
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

  /* Settings, for `GET /v1/me` and `PATCH /v1/me/settings`. */

  settings(): { settings: MeSettings; hibernating: boolean } {
    const { settings, hibernating } = readProfile(this.sql);
    return { settings, hibernating };
  }

  /** Changes settings and, when the app sends it, the person's time zone. */
  updateSettings(update: Partial<MeSettingsUpdate>, timeZone?: string): MeSettings {
    const parsed = Object.keys(update).length === 0 ? {} : MeSettingsUpdate.parse(update);
    const zone = timeZone === undefined ? undefined : TimeZone.parse(timeZone);
    return updateProfile(this.sql, (profile) => applySettings(profile, parsed, zone)).settings;
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

  /* Safety notes: the frame carries no content; the phone fetches the note. */

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

  /* Alarms: held pushes when quiet hours end, remember-me nudges, and late hellos. */

  override async alarm(): Promise<void> {
    const intake = this.intake();
    sockets.closeLate(this.ctx.getWebSockets(), intake.now);
    try {
      await releaseHeld(intake);
      for (const seed of seeds.dueSeeds(this.sql, intake.now)) {
        await considerJob(intake, reminderJob(intake.person, seed, intake.now), false);
        seeds.removeSeed(this.sql, seed.id);
      }
    } catch (error) {
      // What wasn't handled stays held or planted; try again in a minute.
      console.error('cottage alarm failed', { error: String(error) });
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return;
    }
    await this.scheduleAlarm();
  }

  /** Rings at the earliest thing due, as a delay from the cottage's clock. */
  private async scheduleAlarm(): Promise<void> {
    const times = [
      nextHeldAt(this.sql),
      seeds.nextSeedAt(this.sql),
      sockets.nextDeadline(this.ctx.getWebSockets()),
    ].filter((t) => t !== null);
    if (times.length === 0) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Date.now() + Math.max(0, Math.min(...times) - this.now));
  }

  /** The person came back on their own: nudges start again from the first. */
  private cameBack(): void {
    updateProfile(this.sql, (profile) => ({ ...profile, nudgesSinceBack: 0 }));
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
    const hello = sockets.helloIn(message);
    if (hello === null) {
      if (sockets.stateOf(ws)?.authed !== true) sockets.refuse(ws, 'unauthorized');
      return;
    }
    if (hello.protocol !== PROTOCOL_VERSION) {
      sockets.refuse(ws, 'protocol_unsupported');
      return;
    }
    const scope = { cottage: this.person };
    const person = await cottageAdapters().verifyRtToken(this.env, hello.token, scope);
    if (person !== this.person) {
      sockets.refuse(ws, 'unauthorized');
      return;
    }
    ws.serializeAttachment({ authed: true } satisfies sockets.SocketState);
    this.cameBack();
    sockets.send(ws, { type: 'chats', chats: chats.chatList(this.sql, this.now) });
    if (readProfile(this.sql).safetyNote) sockets.send(ws, { type: 'safety_note' });
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
