import {
  type CommandResult,
  type EventEnvelope,
  type EventKind,
  type FarmCommand,
  FarmEvent,
  type FarmState,
  type OpId,
  type PersonId,
  type RejectReason,
  type TimeZone,
} from '@kithfield/contracts';
import { type CommandContext, type EventLookup, localDay } from '@kithfield/farm';

import { addDays, localYmd, nextLocalHour, weekday, zonedInstant } from './calendar';
import { searchText } from './content';
import { mintOpId } from './ids';
import type { FarmPorts } from './ports';
import type { FarmStore } from './store';
import { checkTargets } from './targets';

/** A new entry for the log, before the farm gives it a seq, a time, a day and a rules version. */
export type Draft = { opId: OpId; actor: PersonId | null; kind: EventKind; payload: unknown };

export type Transact = <T>(fn: () => T) => T;

/** A write's outcome: the committed event when this call made it, else null (a duplicate or a rejection). */
export type Written = { result: CommandResult; event: FarmEvent | null };

export type CommandOptions = {
  /** Runs in the write's transaction, after the event is stored. */
  then?: (event: FarmEvent) => void;
  /** A slow post's recipient's own time zone, from their cottage; the farm's when unknown. */
  recipientZone?: TimeZone;
};

/** Slow posts arrive at 07:00 the next morning, or 09:00 on the coming Saturday, the friend's time. */
const MORNING_HOUR = 7;
const WEEKEND_HOUR = 9;
const SATURDAY = 6;

export const fireOutAfterMs = 3 * 60_000;

const deliverAt = (when: 'morning' | 'weekend', now: number, tz: TimeZone): number => {
  if (when === 'morning') return nextLocalHour(now, MORNING_HOUR, tz);
  let day = localYmd(now, tz);
  for (;;) {
    const at = zonedInstant(day, WEEKEND_HOUR, tz);
    if (weekday(day) === SATURDAY && at > now) return at;
    day = addDays(day, 1);
  }
};

/** What a phone's command becomes in the log. */
const payloadOf = (cmd: FarmCommand, now: number, tz: TimeZone): unknown => {
  if (cmd.kind === 'unsend') return { ...cmd.payload, by: 'author' };
  if (cmd.kind === 'removed') return { ...cmd.payload, by: 'keeper' };
  if (cmd.kind === 'left') return { how: 'left' };
  if (cmd.kind === 'slow_post') {
    return { ...cmd.payload, deliverAt: deliverAt(cmd.payload.when, now, tz) };
  }
  return cmd.payload;
};

/**
 * The farm's log and the reducer's state over it. Every write is one synchronous step: assign the
 * next seq and the farm day, parse strictly, reduce, then store the event, the snapshot, the
 * search index and any timer in one transaction. Nothing awaits in between, so writes never race.
 */
export class Farm {
  private loaded = false;
  private current: FarmState | null = null;
  private seq = 0;

  constructor(
    readonly store: FarmStore,
    private readonly ports: () => FarmPorts,
    private readonly transact: Transact,
  ) {}

  /** The reducer's state, rebuilt from the snapshot (and any events after it) on first use. */
  get state(): FarmState | null {
    this.load();
    return this.current;
  }

  get head(): number {
    this.load();
    return this.seq;
  }

  /** Who a person id acts as: a person merged into another acts as the one they became. */
  actorOf(person: PersonId): PersonId {
    return this.store.aliases().get(person) ?? person;
  }

  /** An event from the log, parsed strictly, for the reducer. */
  private readonly lookup: EventLookup = {
    event: (seq) => {
      const parsed = FarmEvent.safeParse(this.store.event(seq));
      return parsed.success ? parsed.data : undefined;
    },
  };

  /** An event from the log as a rule check reads it: a merged-away author reads as who they became. */
  private known(seq: number): EventEnvelope | undefined {
    const event = this.store.event(seq);
    if (event === null) return undefined;
    return event.actor === null ? event : { ...event, actor: this.actorOf(event.actor) };
  }

  private load(): void {
    if (this.loaded) return;
    const { rules } = this.ports();
    const snapshot = this.store.loadSnapshot();
    let state = snapshot?.state ?? null;
    let seq = snapshot?.seq ?? 0;
    const head = this.store.head();
    if (seq < head) {
      for (const envelope of this.store.after(seq, head - seq)) {
        const event = FarmEvent.parse(envelope);
        state = this.reduce(state, event);
        seq = event.seq;
      }
      if (state !== null) this.store.saveSnapshot(seq, state);
    }
    this.current = state;
    this.seq = seq;
    this.loaded = true;
    if (state !== null && rules.RULES_VERSION > state.rulesVersion) {
      const change = { from: state.rulesVersion, to: rules.RULES_VERSION };
      this.write(null, 'rules_changed', change, this.ports().clock.now());
    }
  }

  private reduce(state: FarmState | null, event: FarmEvent): FarmState {
    const { rules } = this.ports();
    if (event.kind === 'farm_created') return rules.createFarm(event);
    if (state === null) throw new Error('The farm has no farm_created event');
    return rules.applyEvent(state, event, this.lookup);
  }

  /** The farm day an event at `at` counts on, stamped on it at commit. */
  private dayOf(draft: Draft, at: number): string {
    if (draft.kind === 'farm_created') {
      return localDay(at, (draft.payload as { timeZone: TimeZone }).timeZone);
    }
    if (this.current === null) throw new Error('The farm has no farm_created event');
    return this.ports().rules.farmDay(this.current, at);
  }

  /**
   * Commits one event. `then` runs inside the same transaction, after the event is stored. Throws
   * when the event fails its schema or the reducer refuses it; nothing is stored then.
   */
  commit(draft: Draft, at: number, then?: (event: FarmEvent) => void): FarmEvent {
    this.load();
    const state = this.current;
    const rulesVersion =
      draft.kind === 'farm_created'
        ? this.ports().rules.RULES_VERSION
        : draft.kind === 'rules_changed'
          ? (draft.payload as { to: number }).to
          : (state?.rulesVersion ?? 0);
    const day = this.dayOf(draft, at);
    const event = FarmEvent.parse({ ...draft, seq: this.seq + 1, at, day, rulesVersion });
    this.transact(() => {
      this.store.insert(event);
      // Reduced once the event is stored, so a `restored` finds its target's payload put back.
      then?.(event);
      const next = this.reduce(state, event);
      this.store.saveSnapshot(event.seq, next);
      const words = searchText(event);
      if (words !== null) {
        const at =
          event.kind === 'edit' && 'target' in event.payload ? event.payload.target : event.seq;
        this.store.index(at, words);
      }
      if (event.kind === 'slow_post' && 'deliverAt' in event.payload) {
        this.store.setTimer(`slow_post:${event.seq}`, event.payload.deliverAt);
      }
      if (event.kind === 'fire' && 'state' in event.payload) {
        if (event.payload.state === 'lit') this.store.setTimer('fire_out', at + fireOutAfterMs);
        if (event.payload.state === 'out') this.store.deleteTimer('fire_out');
      }
      this.current = next;
      this.seq = event.seq;
    });
    return event;
  }

  /** A farm-written event with an op id the farm mints. Null (and logged) if it can't be written. */
  write(
    actor: PersonId | null,
    kind: EventKind,
    payload: unknown,
    at: number,
    then?: (event: FarmEvent) => void,
  ): FarmEvent | null {
    try {
      return this.commit({ opId: mintOpId(at), actor, kind, payload }, at, then);
    } catch (error) {
      console.error('farm write refused', {
        kind,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }

  /**
   * Applies a write once per op id. A repeat gets the first outcome back, rejections included.
   * `attempt` returns a reason to reject, or the draft to commit.
   */
  once(
    opId: OpId,
    at: number,
    attempt: () => RejectReason | Omit<Draft, 'opId'>,
    then?: (event: FarmEvent) => void,
  ): Written {
    const prior = this.store.outcome(opId);
    if (prior !== null) {
      return 'seq' in prior
        ? { result: { result: 'ack', opId, seq: prior.seq }, event: null }
        : { result: { result: 'rejected', opId, reason: prior.reason }, event: null };
    }
    const reject = (reason: RejectReason): Written => {
      this.store.reject(opId, reason, at);
      return { result: { result: 'rejected', opId, reason }, event: null };
    };
    const draft = attempt();
    if (typeof draft === 'string') return reject(draft);
    try {
      const event = this.commit({ ...draft, opId }, at, then);
      return { result: { result: 'ack', opId, seq: event.seq }, event };
    } catch (error) {
      console.warn('write refused', {
        kind: draft.kind,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return reject('invalid');
    }
  }

  /** What the rules need from the log to check a command: targets, today's knocks, the fire. */
  private contextFor(state: FarmState, actor: PersonId, now: number): CommandContext {
    const today = this.ports().rules.farmDay(state, now);
    return {
      event: (seq) => this.known(seq),
      knockedToday: this.store.knockedOn(actor, today),
      satByFire: state.fireLitAt !== null && this.store.satSince(actor, state.fireLitAt),
    };
  }

  /** A phone's command, from the socket or over HTTP. */
  command(cmd: FarmCommand, person: PersonId, options: CommandOptions = {}): Written {
    const now = this.ports().clock.now();
    const actor = this.actorOf(person);
    return this.once(
      cmd.opId,
      now,
      () => {
        const state = this.state;
        if (state === null) return 'not_found';
        const target = checkTargets(cmd, (seq) => this.store.event(seq));
        if (target !== null) return target;
        const check = this.ports().rules.checkCommand(
          state,
          { kind: cmd.kind, payload: cmd.payload },
          actor,
          now,
          this.contextFor(state, actor, now),
        );
        if (!check.ok) return check.reason;
        const tz = options.recipientZone ?? state.timeZone;
        return { actor, kind: cmd.kind, payload: payloadOf(cmd, now, tz) };
      },
      options.then,
    );
  }

  /** Replaces the state outside the log, as when a merged person's id is moved; kept in the snapshot. */
  replaceState(next: FarmState): void {
    this.load();
    this.transact(() => this.store.saveSnapshot(this.seq, next));
    this.current = next;
  }

  /** Remembers a write that never parsed, so its op id keeps its answer. */
  rejectInvalid(opId: OpId): Written {
    return this.once(opId, this.ports().clock.now(), () => 'invalid');
  }
}
