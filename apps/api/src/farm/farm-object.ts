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
  PING,
  PONG,
  type RuleRef,
  type SearchResults,
  type TradedPayload,
} from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { DurableObject } from 'cloudflare:workers';

import type { Bindings } from '../env';
import * as actions from './actions';
import { runAlarm } from './alarms';
import { fireOutAfterMs } from './farm';
import { pageEvents, searchEvents, type WirePage } from './history';
import { FarmHost } from './host';
import type { Profile } from './ports';
import { onMessage, refreshPresence } from './protocol';
import * as safety from './safety';
import { attach, fresh, who } from './sockets';
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

  /** Closes a person's sockets, as after a ban or an account deletion. */
  closeSockets(person: PersonId, code: SocketErrorCode): void {
    this.host.closeSockets(person, code);
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

  /** The visitor's farm wrote its half of a trade: nothing is owed any more. */
  tradeHalfDone(opId: OpId): void {
    this.host.store.tradeHalfDone(opId);
  }

  setHibernating(person: PersonId, on: boolean): Promise<void> {
    return actions.setHibernating(this.host, person, on);
  }

  /** The fire room's occupancy: the fire goes out 3 minutes after the last person leaves. */
  async fireRoom(occupied: boolean): Promise<void> {
    if (occupied) this.host.store.deleteTimer('fire_out');
    else if (this.host.farm.state?.fireLitAt != null)
      this.host.store.setTimer('fire_out', this.host.now() + fireOutAfterMs);
    await this.host.schedule();
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
}
