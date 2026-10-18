import {
  FarmCommand,
  isTombstone,
  type FarmId,
  type FarmState,
  type OpId,
  type PersonId,
  type RejectReason,
} from '@kithfield/contracts';

import { farmDay } from '@kithfield/farm';

import { createSerialQueue } from '../db/sql';
import { applyEnvelopes, storeHistory, type BatchOutcome } from './apply-events';
import { createEventMemory } from './event-memory';
import { createPresenceStore } from './presence-store';
import { viewOf } from './provisional';
import type { CommandCheck } from './farm-rules';
import type {
  EnqueueResult,
  FarmReplicaDeps,
  FarmReplicaState,
  FrameOutcome,
  ReceivedFrame,
} from './replica-types';
import type { OutboxEntry, StoredRejection } from './sync-store';

export type { SyncReport } from './apply-events';

export type * from './replica-types';

/** Any well-formed op id: a dry run reads the kind and payload only. */
const ANY_OP = '00000000-0000-7000-8000-000000000000';

/**
 * One farm on this phone: the confirmed state at `lastSeq`, the cached log, and the outbox drawn
 * on top. Frames are applied one at a time, in arrival order, and every batch commits with the
 * farm's new state in one transaction.
 */
export class FarmReplica<View = unknown> {
  private lastSeq = 0;
  private confirmed: FarmState | null = null;
  private needsSnapshot = false;
  private pending: readonly OutboxEntry[] = [];
  private current: FarmReplicaState;
  private readonly listeners = new Set<() => void>();
  private readonly serial = createSerialQueue();
  private readonly memory = createEventMemory();
  /** Who is here and writing, apart from the farm so it never re-renders what reads the farm. */
  readonly presence = createPresenceStore();

  private constructor(private readonly deps: FarmReplicaDeps<View>) {
    this.current = viewOf(deps.rules, deps.farm, 0, null, [], undefined);
  }

  static async open<View>(deps: FarmReplicaDeps<View>): Promise<FarmReplica<View>> {
    const replica = new FarmReplica(deps);
    await replica.reload();
    return replica;
  }

  /** Reads the farm and its outbox back from the store. */
  private async reload(): Promise<void> {
    const { record, pending } = await this.deps.store.openFarm(this.deps.farm);
    await this.memory.load(this.deps.store, this.deps.farm);
    this.lastSeq = record.lastSeq;
    this.confirmed = record.state;
    this.needsSnapshot = record.needsSnapshot;
    this.pending = pending;
    this.refresh();
  }

  get farm(): FarmId {
    return this.deps.farm;
  }

  /** What `hello` should say: 0 when the phone wants the farm's snapshot. */
  helloSeq(): number {
    return this.needsSnapshot || this.confirmed === null ? 0 : this.lastSeq;
  }

  /** Writes not yet acknowledged, oldest first. */
  unsent(): readonly OutboxEntry[] {
    return this.pending.filter((e) => e.ackedSeq === null);
  }

  getState = (): FarmReplicaState => this.current;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Applies one frame from the farm socket. */
  handle(frame: ReceivedFrame): Promise<FrameOutcome> {
    return this.serial(async (): Promise<FrameOutcome> => {
      switch (frame.type) {
        case 'snapshot':
          return this.takeSnapshot(frame.seq, frame.state);
        case 'events':
          return { ...(await this.applyBatch(frame.events)), caughtUp: !frame.more };
        case 'event':
          return this.applyBatch([frame.event]);
        case 'ack':
          await this.acked(frame.opId, frame.seq);
          return {};
        case 'rejected':
          await this.reject([frame.opId], frame.reason);
          return {};
        case 'presence':
          this.presence.here(frame.here);
          return {};
        case 'typing':
          this.presence.typing(frame.people);
          return {};
        case 'error':
        case 'unknown':
          return {};
      }
    });
  }

  /** Applies a page of events fetched over HTTP, as if they came on the socket. */
  applyPage(events: readonly unknown[]): Promise<BatchOutcome> {
    return this.serial(() => this.applyBatch(events));
  }

  /**
   * Puts a history page into the cache, sorted like live events but without the reducer (it is
   * behind `lastSeq`). `restoreTargets` are the restore targets this page brings back.
   */
  cacheHistory(events: readonly unknown[], restoreTargets: readonly number[] = []): Promise<void> {
    return this.serial(async () => {
      const { store } = this.deps;
      await store.transaction(() => storeHistory(this.context(), this.lastSeq, events));
      for (const seq of restoreTargets) this.memory.tried.add(seq);
    });
  }

  /** The HTTP answer to a write, with the same meaning as the socket's `ack` and `rejected`. */
  settle(opId: OpId, outcome: { seq: number } | { reason: RejectReason }): Promise<void> {
    return this.serial(() =>
      'seq' in outcome ? this.acked(opId, outcome.seq) : this.reject([opId], outcome.reason),
    );
  }

  /**
   * The farm can never take these writes (the person left or was removed, the farm is gone): every
   * unsent one becomes a rejection with `reason`, in one transaction, so the outbox never blocks.
   */
  rejectAll(reason: RejectReason): Promise<number> {
    return this.serial(async () => {
      const ids = this.unsent().map((e) => e.opId);
      await this.reject(ids, reason);
      return ids.length;
    });
  }

  /**
   * Queues a write and draws it at once. The connection sends it. A write made again with an op
   * id this phone already holds (a send repeated after a crash) is not queued twice: it answers
   * as the first one did, `queued` while waiting or landed, `refused` once the farm refused it.
   */
  enqueue(
    actor: PersonId,
    write: { kind: string; payload: unknown; opId?: OpId | undefined },
  ): Promise<EnqueueResult> {
    return this.serial(async () => {
      const { store, now, newOpId, farm } = this.deps;
      if (write.opId !== undefined) {
        const before = await this.made(write.opId);
        if (before) return before;
      }
      const parsed = FarmCommand.safeParse({
        opId: write.opId ?? newOpId(),
        kind: write.kind,
        payload: write.payload,
      });
      // A write no farm would take (a kind phones can't send, a payload that fails its schema).
      if (!parsed.success) return { status: 'refused', reason: 'invalid' };
      const cmd = parsed.data;
      const at = now();
      const check = this.check(actor, cmd, at);
      if (!check.ok) return { status: 'refused', reason: check.reason };
      const entry: OutboxEntry = {
        opId: cmd.opId,
        farm,
        actor,
        kind: cmd.kind,
        payload: cmd.payload,
        createdAt: at,
        attempts: 0,
        ackedSeq: null,
      };
      await store.transaction(() => store.addOutbox(entry));
      this.pending = [...this.pending, entry];
      this.refresh();
      return { status: 'queued', opId: cmd.opId };
    });
  }

  /**
   * Whether the farm would take this write from `actor` now, by the same shared rules `enqueue`
   * runs: screens offer only what would be taken (an edit inside its window, an unsend of a slow
   * post not yet delivered, one knock a day). Nothing is queued.
   */
  canWrite(actor: PersonId, write: { kind: string; payload: unknown }): CommandCheck {
    const parsed = FarmCommand.safeParse({ opId: ANY_OP, ...write });
    if (!parsed.success) return { ok: false, reason: 'invalid' };
    return this.check(actor, parsed.data, this.deps.now());
  }

  private check(actor: PersonId, cmd: FarmCommand, at: number): CommandCheck {
    const state = this.current.state;
    if (!state) return { ok: true };
    return this.deps.rules.checkCommand(state, cmd, actor, at, {
      event: this.memory.find,
      knockedToday: this.knockedToday(state, actor, at),
    });
  }

  /**
   * Friends `actor` has knocked for on the farm's day at `at`: knocks the phone holds, and knocks
   * still in the outbox (they land today).
   */
  private knockedToday(state: FarmState, actor: PersonId, at: number): PersonId[] {
    const today = farmDay(state, at);
    const to = (payload: unknown): unknown =>
      isTombstone(payload) ? payload.facts?.to : (payload as { to?: unknown } | null)?.to;
    const people = new Set<PersonId>();
    for (const e of this.memory.all()) {
      if (e.kind !== 'knock' || e.actor !== actor) continue;
      if ((e.day ?? farmDay(state, e.at)) !== today) continue;
      const person = to(e.payload);
      if (typeof person === 'string') people.add(person);
    }
    for (const e of this.pending) {
      if (e.kind !== 'knock' || e.actor !== actor) continue;
      const person = to(e.payload);
      if (typeof person === 'string') people.add(person);
    }
    return [...people];
  }

  /** How a write with this op id went, if this phone made it already. */
  private async made(opId: OpId): Promise<EnqueueResult | null> {
    const { store, farm } = this.deps;
    if (this.pending.some((e) => e.opId === opId)) return { status: 'queued', opId };
    if ((await store.seenOps(farm, [opId])).has(opId)) return { status: 'queued', opId };
    const refused = await store.rejection(opId);
    return refused ? { status: 'refused', reason: refused.reason } : null;
  }

  /** Counts a send of these writes, for diagnosing a stuck outbox. */
  countAttempts = (opIds: readonly string[]): Promise<unknown> =>
    this.deps.store.transaction(() =>
      Promise.all(opIds.map((id) => this.deps.store.countAttempt(id))),
    );

  /** Takes the farm's snapshot. Past a gap the cached log is emptied: its tombstones may be stale. */
  private async takeSnapshot(seq: number, state: FarmState): Promise<FrameOutcome> {
    const { store, farm, now } = this.deps;
    const jumped = seq > this.lastSeq + 1;
    await store.transaction(async () => {
      if (jumped) {
        await store.clearEvents(farm);
        this.memory.clear();
      }
      await store.saveFarm({ farm, lastSeq: seq, state, needsSnapshot: false }, now());
      await this.dropSettled(seq, new Set());
    });
    this.lastSeq = seq;
    this.confirmed = state;
    this.needsSnapshot = false;
    this.refresh();
    return jumped ? { jumped } : {};
  }

  private async applyBatch(events: readonly unknown[]): Promise<BatchOutcome> {
    const { store, farm, now } = this.deps;
    const pendingOps = new Set(this.pending.map((e) => e.opId));
    const result = await store.transaction(async () => {
      const applied = await applyEnvelopes(
        this.context(),
        { lastSeq: this.lastSeq, state: this.confirmed, needsSnapshot: this.needsSnapshot },
        events,
        pendingOps,
      );
      await store.saveFarm({ farm, ...applied.record }, now());
      await this.dropSettled(applied.record.lastSeq, applied.seen);
      return applied;
    });
    this.lastSeq = result.record.lastSeq;
    this.confirmed = result.record.state;
    this.needsSnapshot = result.record.needsSnapshot;
    this.refresh();
    return result.outcome;
  }

  /** Drops outbox rows whose event the phone now holds. */
  private async dropSettled(lastSeq: number, seen: ReadonlySet<string>): Promise<void> {
    const settled = this.pending.filter(
      (e) => seen.has(e.opId) || (e.ackedSeq !== null && e.ackedSeq <= lastSeq),
    );
    for (const e of settled) await this.deps.store.removeOutbox(e.opId);
    this.pending = this.pending.filter((e) => !settled.includes(e));
  }

  private async acked(opId: OpId, seq: number): Promise<void> {
    if (!this.pending.some((e) => e.opId === opId)) return;
    const { store } = this.deps;
    if (seq <= this.lastSeq) {
      await store.transaction(() => store.removeOutbox(opId));
      this.pending = this.pending.filter((e) => e.opId !== opId);
    } else {
      await store.transaction(() => store.ackOutbox(opId, seq));
      this.pending = this.pending.map((e) => (e.opId === opId ? { ...e, ackedSeq: seq } : e));
    }
    this.refresh();
  }

  /** Final refusals: out of the outbox and into the rejections the UI explains, together. */
  private async reject(opIds: readonly OpId[], reason: RejectReason): Promise<void> {
    const { store, farm, now, onRejected } = this.deps;
    const entries = this.pending.filter((e) => opIds.includes(e.opId));
    if (entries.length === 0) return;
    const rejections = entries.map((e): StoredRejection => ({
      opId: e.opId,
      farm,
      kind: e.kind,
      payload: e.payload,
      reason,
      at: now(),
    }));
    await store.transaction(() => store.moveToRejections(rejections));
    this.pending = this.pending.filter((e) => !entries.includes(e));
    this.refresh();
    for (const r of rejections) onRejected(r);
  }

  private context() {
    const { store, farm, rules, report, now } = this.deps;
    const { remember, tried, find } = this.memory;
    return { store, farm, rules, report, now, remember, tried, find };
  }

  private drawnFrom: readonly OutboxEntry[] | null = null;

  /**
   * Rebuilds what the UI reads and tells listeners, only when something changed. The drawn farm
   * is recomputed only when the confirmed farm or the pending writes changed.
   */
  private refresh(): void {
    const before = this.current as FarmReplicaState | undefined;
    const reuse = before?.confirmed === this.confirmed && this.drawnFrom === this.pending;
    this.drawnFrom = this.pending;
    if (reuse && before.lastSeq === this.lastSeq) return;
    const { rules, farm } = this.deps;
    const view = viewOf(
      rules,
      farm,
      this.lastSeq,
      this.confirmed,
      this.pending,
      reuse ? before : undefined,
    );
    this.current = view;
    for (const listener of this.listeners) listener();
  }
}
