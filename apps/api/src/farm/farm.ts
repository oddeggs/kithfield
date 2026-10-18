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
import { ZodError } from 'zod';

import { searchText } from './content';
import { payloadOf } from './drafts';
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

/** The fire goes out this long after the last person leaves the room. */
export const fireOutAfterMs = 3 * 60_000;

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
  }

  /** On wake: a farm whose rules are older than this server's moves to them with `rules_changed`. */
  upgradeRules(): FarmEvent | null {
    const state = this.state;
    const { rules } = this.ports();
    if (state === null || rules.RULES_VERSION <= state.rulesVersion) return null;
    const change = { from: state.rulesVersion, to: rules.RULES_VERSION };
    return this.write(null, 'rules_changed', change, this.ports().clock.now());
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
      // Slow posts reach the cottages when they arrive, not when sent.
      if (event.kind !== 'slow_post') this.store.oweDelivery(event.seq, event.at);
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
      // Only a write that fails its schema is answered for good; anything else (a fault, a time
      // zone this server can't read) is thrown, so nothing is stored and the phone tries again.
      if (!(error instanceof ZodError)) throw error;
      console.warn('write refused', { kind: draft.kind, issues: error.issues.length });
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

  /**
   * Replaces the state outside the log, as when a merged person's id is moved: kept in the snapshot,
   * with `alongside` in the same transaction.
   */
  replaceState(next: FarmState, alongside: () => void = () => undefined): void {
    this.load();
    this.transact(() => {
      this.store.saveSnapshot(this.seq, next);
      alongside();
    });
    this.current = next;
  }

  /** Remembers a write that never parsed, so its op id keeps its answer. */
  rejectInvalid(opId: OpId): Written {
    return this.once(opId, this.ports().clock.now(), () => 'invalid');
  }
}
