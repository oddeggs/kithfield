import {
  type CommandResult,
  type Crop,
  type CritterChangedPayload,
  type EpochMs,
  type EventsQuery,
  type FarmCommand,
  type FarmGate,
  type FarmState,
  type GateGesture,
  type OpId,
  type PersonId,
  type RejectReason,
  type SocketErrorCode,
  type FarmEvent,
  type GiftPayload,
  PING,
  PONG,
  type RuleRef,
  type SearchResults,
  TradedPayload,
} from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { DurableObject } from 'cloudflare:workers';

import type { RoomEvent } from '../calls/circle';
import { onRoomEvent } from '../calls/farm-fire';
import type { Bindings } from '../env';
import { type RecapFacts, recapOf } from '../rhythm/recap-facts';
import { scrapbookOf, type WireScrapbook } from '../rhythm/scrapbook';
import * as actions from './actions';
import { chipInGift, chipInTheme } from './chip-in-writes';
import { runAlarm } from './alarms';
import { exportOf, type FarmExport } from './export';
import { pageEvents, searchEvents, type WirePage } from './history';
import { FarmHost } from './host';
import type { Profile } from './ports';
import { onMessage, refreshPresence } from './protocol';
import * as safety from './safety';
import { attach, fresh, refuse, who } from './sockets';
import { farmPorts } from './wiring';

/**
 * One per farm or visit: the event log, the reducer's state over it, search, presence and the
 * alarms. Sockets hibernate; `ping` is answered without waking the object.
 */
export class FarmDO extends DurableObject<Bindings> {
  private readonly host: FarmHost;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    this.host = new FarmHost(ctx, env, farmPorts);
    // A farm on older rules moves to this server's before anything else reaches it.
    void ctx.blockConcurrencyWhile(() => this.host.wake());
  }

  /** The farm socket. The token comes in the first frame (`hello`), never the URL. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: { code: 'bad_request' } }, { status: 426 });
    }
    const farm = /\/farms\/([A-Za-z0-9_-]{1,64})\/socket$/.exec(new URL(request.url).pathname)?.[1];
    if (farm === undefined) return Response.json({ error: { code: 'not_found' } }, { status: 404 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    attach(server, fresh(farm, this.host.now()));
    this.host.expectHello();
    await this.host.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await onMessage(this.host, ws, message);
  }

  override webSocketClose(ws: WebSocket): void {
    this.left(ws);
  }

  override webSocketError(ws: WebSocket): void {
    this.left(ws);
  }

  private left(ws: WebSocket): void {
    const all = this.ctx.getWebSockets();
    const before = all.includes(ws) ? all : [...all, ws];
    refreshPresence(this.host, { here: who(before, 'here'), typing: who(before, 'typing') }, ws);
  }

  override async alarm(): Promise<void> {
    const events: FarmEvent[] = [];
    try {
      await runAlarm(this.host, events);
    } finally {
      // Whatever was written is told and settled, and the alarm set again, even after a failure.
      this.host.publish(events);
      await this.host.settle(events);
    }
  }

  /* Called by the API's routes. */

  async create(input: actions.CreateInput): Promise<void> {
    await actions.createFarm(this.host, input);
  }

  state(): FarmState | null {
    return this.host.farm.state;
  }

  /** The farm as the shared rules draw it now: sleepy, misty, season, plants, critters. */
  view(): FarmView | null {
    const state = this.host.farm.state;
    return state === null ? null : farmPorts().rules.farmView(state, this.host.now());
  }

  /** The person changed their profile: written here once per op id. */
  profileChanged(
    person: PersonId,
    opId: OpId,
    changed: CritterChangedPayload,
  ): Promise<CommandResult> {
    return actions.profileChanged(this.host, person, opId, changed);
  }

  /** Friends' chip-in covered a gift: written on behalf of whoever started it, once per op id. */
  chipInGift(
    opId: OpId,
    starter: PersonId,
    payload: Extract<GiftPayload, { action: 'given' }>,
  ): Promise<CommandResult> {
    return chipInGift(this.host, opId, starter, payload);
  }

  /** Friends' chip-in covered a farm theme: it switches on, with no actor, once per op id. */
  chipInTheme(opId: OpId, theme: string): Promise<CommandResult> {
    return chipInTheme(this.host, opId, theme);
  }

  /** An anonymous person was merged into a returning one: see `actions.mergePerson`. */
  mergePerson(from: PersonId, into: PersonId): Promise<void> {
    return actions.mergePerson(this.host, from, into);
  }

  async command(person: PersonId, cmd: FarmCommand): Promise<CommandResult> {
    const media: string[] = [];
    const written = await this.host.command(cmd, person, media);
    if (written.event !== null) {
      this.host.publish([written.event]);
      await this.host.settle([written.event], media);
    }
    return written.result;
  }

  /** The answer a write already got, if any. */
  answered(opId: OpId): CommandResult | null {
    const prior = this.host.store.outcome(opId);
    if (prior === null) return null;
    return 'seq' in prior
      ? { result: 'ack', opId, seq: prior.seq }
      : { result: 'rejected', opId, reason: prior.reason };
  }

  /** A command that didn't parse still gets an answer, kept for its op id. */
  rejectInvalid(opId: OpId): CommandResult {
    return this.host.farm.rejectInvalid(opId).result;
  }

  /** Whether a person lives here now, by the farm's own state (D1 only mirrors it). */
  private livesHere(person: PersonId): boolean {
    const actor = this.host.farm.actorOf(person);
    return this.host.farm.state?.members.some((m) => m.person === actor) === true;
  }

  /** History, for members only; null for anyone else. */
  page(person: PersonId, query: EventsQuery): WirePage | null {
    return this.livesHere(person) ? pageEvents(this.host.store, query) : null;
  }

  /** Search, for members only; null for anyone else. */
  search(person: PersonId, q: string): SearchResults | null {
    return this.livesHere(person) ? searchEvents(this.host.store, q) : null;
  }

  /** The scrapbook's pressed pages, for members only; null for anyone else. */
  scrapbook(person: PersonId, before: number | null): WireScrapbook | null {
    return this.livesHere(person) ? scrapbookOf(this.host.store, before) : null;
  }

  /** A week's recap facts, for members only; `bad_week` for a week that isn't a Sunday come. */
  recapFacts(person: PersonId, week: string | null): RecapFacts | 'bad_week' | null {
    const state = this.host.farm.state;
    if (state === null || !this.livesHere(person)) return null;
    const today = this.host.ports().rules.farmDay(state, this.host.now());
    return recapOf(this.host.store, state, today, week);
  }

  /** What the person wrote and shared here, for their keepsakes export. */
  exportFor(person: PersonId): FarmExport | null {
    return exportOf(this.host, person);
  }

  /** Closes a person's sockets, as after a ban or an account deletion. */
  closeSockets(person: PersonId, code: SocketErrorCode): void {
    this.host.closeSockets(person, code);
  }

  /** That device was signed out from another one: its sockets here close. */
  closeSession(session: string): void {
    this.host.closeSession(session);
  }

  join(person: PersonId, profile: Profile, approved: boolean): Promise<actions.JoinOutcome> {
    return actions.joinFarm(this.host, person, profile, approved);
  }

  gate(visitor: PersonId): FarmGate | null {
    return actions.gateView(this.host, visitor);
  }

  atGate(
    visitor: PersonId,
    profile: Profile,
    opId: OpId,
    gesture: GateGesture,
  ): Promise<CommandResult> {
    return actions.atGate(this.host, visitor, profile, opId, gesture);
  }

  basketCrop(plant: string): Crop | null {
    return actions.basketCrop(this.host, plant);
  }

  /** Why a trade with another farm can't be written here now, or null. Writes nothing. */
  canTrade(otherFarm: string, actor: PersonId): RejectReason | null {
    return actions.canTrade(this.host, otherFarm, actor);
  }

  recordTrade(
    opId: OpId,
    actor: PersonId,
    payload: TradedPayload,
    half?: actions.TradeHalf,
    options?: actions.TradeOptions,
  ): Promise<CommandResult> {
    return actions.recordTrade(this.host, opId, actor, payload, half, options);
  }

  /**
   * The trade this farm wrote for an op id it answered, so a retry finishes that trade and no
   * other: null when the op id went to anything but a trade.
   */
  tradeFor(opId: OpId): { actor: PersonId; payload: TradedPayload } | null {
    const prior = this.host.store.outcome(opId);
    if (prior === null || !('seq' in prior)) return null;
    const event = this.host.store.event(prior.seq);
    if (event?.kind !== 'traded' || event.actor === null) return null;
    const payload = TradedPayload.safeParse(event.payload);
    return payload.success ? { actor: event.actor, payload: payload.data } : null;
  }

  /** The visitor's farm wrote its half of a trade: nothing is owed any more. */
  tradeHalfDone(opId: OpId): void {
    this.host.store.tradeHalfDone(opId);
  }

  setHibernating(person: PersonId, on: boolean): Promise<void> {
    return actions.setHibernating(this.host, person, on);
  }

  /** The fire room's webhook: who is by the fire, and the fire going out after the last leaves. */
  fireRoomEvent(event: RoomEvent): Promise<void> {
    return onRoomEvent(this.host, event);
  }

  /* Called by the safety team's tools and account deletion. */

  removeEvent(target: number, rule: RuleRef): Promise<safety.SafetyOutcome> {
    return safety.removeEvent(this.host, target, rule);
  }

  restoreEvent(target: number): Promise<safety.SafetyOutcome> {
    return safety.restore(this.host, target);
  }

  removeMember(person: PersonId, removeMedia: boolean): Promise<safety.SafetyOutcome> {
    return safety.removeMember(this.host, person, removeMedia);
  }

  pause(person: PersonId, until: EpochMs | null): Promise<safety.SafetyOutcome> {
    return safety.pause(this.host, person, until);
  }

  freeze(on: boolean): Promise<safety.SafetyOutcome> {
    return safety.freeze(this.host, on);
  }

  deleteAccount(person: PersonId): Promise<void> {
    return safety.deleteAccount(this.host, person);
  }

  /**
   * Forgets a farm nobody lives on any more (its last member's account was deleted): every socket
   * closes and the object's storage and alarm go. False, touching nothing, while anyone lives here.
   */
  async teardown(): Promise<boolean> {
    if ((this.host.farm.state?.members.length ?? 0) > 0) return false;
    for (const ws of this.ctx.getWebSockets()) refuse(ws, 'farm_gone');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    // What this instance still holds in memory goes too, once this answer is on its way.
    setTimeout(() => this.ctx.abort('farm_gone'), 0);
    return true;
  }
}
