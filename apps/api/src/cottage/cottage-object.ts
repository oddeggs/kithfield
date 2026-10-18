import {
  type ChatListItem,
  CottageClientFrame,
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
} from '@kithfield/contracts';
import { DurableObject } from 'cloudflare:workers';

import type { Bindings } from '../env';
import type { Decision } from '../push/policy';
import { cottageAdapters } from './adapters';
import * as chats from './chats';
import * as devices from './devices';
import {
  type Claim,
  claimJob,
  considerDelivery,
  considerJob,
  type Intake,
  nextHeldAt,
  releaseHeld,
  reminderJob,
} from './intake';
import { applySettings, readProfile, updateProfile } from './profile';
import { applySchema } from './schema';
import * as seeds from './seeds';

type SocketState = { readonly authed: boolean };

/**
 * One per person, named by their person id (`cottageOf` in `./stub`). It keeps the chat list and what waits
 * in Quick Tend, the person's settings and devices, the push budget and quiet hours, and their
 * remember-me seeds. The phone holds one socket to it; farms and the API call its methods.
 *
 * For the farm object, after each committed event, per member: `deliver(CottageDelivery)`.
 * When a membership or a farm's name or a visit's peer changes: `upsertFarm` / `leaveFarm`.
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
    return { sql: this.sql, env: this.env, person: this.person, now: Date.now() };
  }

  /* From the farms. */

  /**
   * A farm committed an event: update the chat list and Quick Tend, tell the phone, and decide
   * whether to push. A repeated delivery (a seq already held) does nothing.
   */
  async deliver(delivery: CottageDelivery): Promise<void> {
    const parsed = CottageDelivery.parse(delivery);
    const intake = this.intake();
    if (!chats.applyDelivery(this.sql, parsed, intake.person)) return;
    if (parsed.actor === intake.person && parsed.kind === 'farm_opened') this.cameBack();
    this.sendRow(parsed.farm, intake.now);
    await considerDelivery(intake, parsed);
    await this.scheduleAlarm();
  }

  /** The person lives on this farm or visit: its kind, name or peer, and their pin. */
  upsertFarm(info: chats.CottageFarm): void {
    const parsed = chats.CottageFarm.parse(info);
    chats.upsertFarm(this.sql, parsed);
    this.sendRow(parsed.farm, Date.now());
  }

  /** The person left, or was removed: the farm leaves their chat list. */
  leaveFarm(farm: string): void {
    chats.removeFarm(this.sql, farm);
    this.broadcast({ type: 'chats', chats: chats.chatList(this.sql, Date.now()) });
  }

  /** Mutes a farm until a time (null unmutes). Muted farms never push. */
  muteFarm(farm: string, until: number | null): void {
    chats.setMuted(this.sql, farm, until);
    this.sendRow(farm, Date.now());
  }

  pinFarm(farm: string, pinned: boolean): void {
    chats.setPinned(this.sql, farm, pinned);
    this.sendRow(farm, Date.now());
  }

  chatList(): ChatListItem[] {
    return chats.chatList(this.sql, Date.now());
  }

  /** Everything waiting in Quick Tend, newest first. */
  waiting(): chats.WaitingItem[] {
    return chats.waitingItems(this.sql);
  }

  clearWaiting(farm: string): void {
    chats.clearWaiting(this.sql, farm);
    this.sendRow(farm, Date.now());
  }

  /* Pushes. */

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

  /* Devices. */

  registerDevice(device: string, request: RegisterDeviceRequest): void {
    devices.registerDevice(this.sql, device, RegisterDeviceRequest.parse(request), Date.now());
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

  updateSettings(update: MeSettingsUpdate): MeSettings {
    const parsed = MeSettingsUpdate.parse(update);
    return updateProfile(this.sql, (profile) => applySettings(profile, parsed)).settings;
  }

  /** Hibernating pauses every push and nudge. Returns whether it changed. */
  setHibernating(on: boolean): boolean {
    const before = readProfile(this.sql).hibernating;
    updateProfile(this.sql, (profile) => ({ ...profile, hibernating: on }));
    return before !== on;
  }

  /* Remember-me seeds: personal, grow nothing, nudge once at `nudgeAt`. */

  async plantSeed(request: RememberRequest): Promise<string | null> {
    const id = seeds.plantSeed(this.sql, RememberRequest.parse(request), Date.now());
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

  /* Alarms: held pushes when quiet hours end, and remember-me nudges. */

  override async alarm(): Promise<void> {
    const intake = this.intake();
    await releaseHeld(intake);
    for (const seed of seeds.takeDueSeeds(this.sql, intake.now)) {
      await considerJob(intake, reminderJob(intake.person, seed, intake.now), false);
    }
    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    const times = [nextHeldAt(this.sql), seeds.nextSeedAt(this.sql)].filter((t) => t !== null);
    if (times.length === 0) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.min(...times));
  }

  /** The person came back on their own: nudges start again from the first. */
  private cameBack(): void {
    updateProfile(this.sql, (profile) => ({ ...profile, nudgesSinceBack: 0 }));
  }

  /* The cottage socket: `hello {protocol, token}` first, then `chats`, then a `chat` per change. */

  override fetch(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: { code: 'bad_request' } }, { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authed: false } satisfies SocketState);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const authed = (ws.deserializeAttachment() as SocketState | null)?.authed === true;
    let raw: unknown;
    try {
      raw = typeof message === 'string' ? JSON.parse(message) : null;
    } catch {
      raw = null;
    }
    const frame = CottageClientFrame.safeParse(raw);
    if (!frame.success || frame.data.type !== 'hello') {
      if (!authed) this.refuse(ws, 'unauthorized');
      return;
    }
    if (frame.data.protocol !== PROTOCOL_VERSION) {
      this.refuse(ws, 'protocol_unsupported');
      return;
    }
    const claims = await cottageAdapters().verifyRtToken(this.env, frame.data.token);
    if (claims === null || claims.person !== this.person || claims.farm !== null) {
      this.refuse(ws, 'unauthorized');
      return;
    }
    ws.serializeAttachment({ authed: true } satisfies SocketState);
    this.cameBack();
    send(ws, { type: 'chats', chats: chats.chatList(this.sql, Date.now()) });
    if (readProfile(this.sql).safetyNote) send(ws, { type: 'safety_note' });
  }

  /** Completes the closing handshake; a socket already closed needs nothing. */
  override webSocketClose(ws: WebSocket, code: number): void {
    if (ws.readyState === WebSocket.OPEN) ws.close(code === 1005 || code === 1006 ? 1000 : code);
  }

  private refuse(ws: WebSocket, code: SocketErrorCode): void {
    send(ws, { type: 'error', code });
    ws.close(1008, code);
  }

  private sendRow(farm: string, now: number): void {
    const chat = chats.chatRow(this.sql, farm, now);
    if (chat !== null) this.broadcast({ type: 'chat', chat });
  }

  private broadcast(frame: CottageServerFrame): void {
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as SocketState | null)?.authed === true) send(ws, frame);
    }
  }
}

/** Sends a frame; a socket that closed in between catches up with `chats` on its next hello. */
function send(ws: WebSocket, frame: CottageServerFrame): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
}
