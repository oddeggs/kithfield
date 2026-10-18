import {
  FarmCommand,
  type FarmId,
  type FarmState,
  type OpId,
  type PersonId,
  type RejectReason,
} from '@kithfield/contracts';

import { createSerialQueue } from '../db/sql';
import { applyEnvelopes, storeHistory, type BatchOutcome } from './apply-events';
import { createPresenceStore } from './presence-store';
import { viewOf } from './provisional';
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
   * behind `lastSeq`). Events an appeal restored also go through the rules' `applyRestored`.
   */
  cacheHistory(events: readonly unknown[], restored = false): Promise<void> {
    return this.serial(async () => {
      const { store, farm, now, rules, report } = this.deps;
      const record = {
        lastSeq: this.lastSeq,
        state: this.confirmed,
        needsSnapshot: this.needsSnapshot,
      };
      await store.transaction(async () => {
        const state = await storeHistory(
          { store, farm, rules, report, now },
          record,
          events,
          restored,
        );
        if (state === this.confirmed) return;
        await store.saveFarm({ farm, ...record, state }, now());
        this.confirmed = state;
      });
      this.refresh();
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

  /** Queues a write and draws it at once. The connection sends it. */
  enqueue(actor: PersonId, write: { kind: string; payload: unknown }): Promise<EnqueueResult> {
    return this.serial(async () => {
      const { rules, store, now, newOpId, farm } = this.deps;
      const parsed = FarmCommand.safeParse({ opId: newOpId(), ...write });
      // A write no farm would take (a kind phones can't send, a payload that fails its schema).
      if (!parsed.success) return { status: 'refused', reason: 'invalid' };
      const cmd = parsed.data;
      const at = now();
      if (this.current.state) {
        const reason = rules.checkCommand(this.current.state, cmd, actor, at);
        if (reason !== null) return { status: 'refused', reason };
      }
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
      if (jumped) await store.clearEvents(farm);
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
    const { store, farm, rules, now, report } = this.deps;
    const pendingOps = new Set(this.pending.map((e) => e.opId));
    const result = await store.transaction(async () => {
      const applied = await applyEnvelopes(
        { store, farm, rules, report, now },
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
