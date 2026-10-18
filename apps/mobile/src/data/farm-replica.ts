import {
  FarmCommand,
  parseEvent,
  type EventEnvelope,
  type FarmId,
  type FarmServerFrame,
  type FarmState,
  type OpId,
  type PersonId,
  type RejectReason,
} from '@kithfield/contracts';

import { createSerialQueue } from '../db/sql';
import { applyEnvelopes, type BatchOutcome } from './apply-events';
import { drawPending } from './provisional';
import type {
  EnqueueResult,
  FarmReplicaDeps,
  FarmReplicaState,
  FrameOutcome,
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
  private pending: OutboxEntry[] = [];
  private presence: readonly PersonId[] = [];
  private typing: readonly PersonId[] = [];
  private current: FarmReplicaState;
  private readonly listeners = new Set<() => void>();
  private readonly serial = createSerialQueue();

  private constructor(private readonly deps: FarmReplicaDeps<View>) {
    this.current = this.build();
  }

  static async open<View>(deps: FarmReplicaDeps<View>): Promise<FarmReplica<View>> {
    const replica = new FarmReplica(deps);
    await replica.reload();
    return replica;
  }

  /** Reads the farm and its outbox back from the store. */
  private async reload(): Promise<void> {
    const { store, farm } = this.deps;
    const record = await store.farm(farm);
    this.lastSeq = record.lastSeq;
    this.confirmed = record.state;
    this.needsSnapshot = record.needsSnapshot;
    const outbox = await store.outbox(farm);
    // A write whose event already landed is settled, whether or not its ack arrived.
    const seen = await store.seenOps(
      farm,
      outbox.map((e) => e.opId),
    );
    const settled = outbox.filter(
      (e) => seen.has(e.opId) || (e.ackedSeq ?? Infinity) <= record.lastSeq,
    );
    if (settled.length > 0) {
      await store.transaction(async () => {
        for (const e of settled) await store.removeOutbox(e.opId);
      });
    }
    this.pending = outbox.filter((e) => !settled.includes(e));
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
  handle(frame: FarmServerFrame): Promise<FrameOutcome> {
    return this.serial(async () => {
      switch (frame.type) {
        case 'snapshot':
          await this.takeSnapshot(frame.seq, frame.state);
          return {};
        case 'events': {
          const outcome = await this.applyBatch(frame.events);
          return { ...outcome, caughtUp: !frame.more };
        }
        case 'event':
          return this.applyBatch([frame.event]);
        case 'ack':
          await this.acked(frame.opId, frame.seq);
          return {};
        case 'rejected':
          await this.rejected(frame.opId, frame.reason);
          return {};
        case 'presence':
          this.presence = frame.here;
          this.refresh();
          return {};
        case 'typing':
          this.typing = frame.people;
          this.refresh();
          return {};
        case 'error':
        case 'unknown':
          return {};
      }
    });
  }

  /** Applies a page of events fetched over HTTP, as if they came on the socket. */
  applyPage(events: readonly EventEnvelope[]): Promise<BatchOutcome> {
    return this.serial(() => this.applyBatch(events));
  }

  /** Puts a history page into the cache without running the reducer (it is behind `lastSeq`). */
  cacheHistory(events: readonly EventEnvelope[]): Promise<void> {
    return this.serial(async () => {
      const { store, farm, now } = this.deps;
      await store.transaction(async () => {
        for (const raw of events) {
          if (raw.seq > this.lastSeq) continue;
          const parsed = parseEvent(raw);
          if (parsed.status === 'invalid') await store.putInvalid(farm, parsed, now());
          else await store.putEvent(farm, { ...parsed.event, known: parsed.status === 'known' });
        }
      });
    });
  }

  /** The HTTP answer to a write, with the same meaning as the socket's `ack` and `rejected`. */
  settle(opId: OpId, outcome: { seq: number } | { reason: RejectReason }): Promise<void> {
    return this.serial(() =>
      'seq' in outcome ? this.acked(opId, outcome.seq) : this.rejected(opId, outcome.reason),
    );
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
  countAttempts(opIds: readonly string[]): Promise<void> {
    return this.deps.store.transaction(async () => {
      for (const opId of opIds) await this.deps.store.countAttempt(opId);
    });
  }

  private async takeSnapshot(seq: number, state: FarmState): Promise<void> {
    const { store, farm, now } = this.deps;
    await store.transaction(async () => {
      await store.saveFarm({ farm, lastSeq: seq, state, needsSnapshot: false }, now());
      await this.dropSettled(seq, new Set());
    });
    this.lastSeq = seq;
    this.confirmed = state;
    this.needsSnapshot = false;
    this.refresh();
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
    const gone = new Set(settled.map((e) => e.opId));
    this.pending = this.pending.filter((e) => !gone.has(e.opId));
  }

  private async acked(opId: OpId, seq: number): Promise<void> {
    const entry = this.pending.find((e) => e.opId === opId);
    if (!entry) return;
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

  private async rejected(opId: OpId, reason: RejectReason): Promise<void> {
    const entry = this.pending.find((e) => e.opId === opId);
    if (!entry) return;
    const { store, farm, now, onRejected } = this.deps;
    const rejection: StoredRejection = {
      opId,
      farm,
      kind: entry.kind,
      payload: entry.payload,
      reason,
      at: now(),
    };
    await store.transaction(async () => {
      await store.removeOutbox(opId);
      await store.addRejection(rejection);
    });
    this.pending = this.pending.filter((e) => e.opId !== opId);
    this.refresh();
    onRejected(rejection);
  }

  /** The confirmed farm with every pending write drawn on top, in the order they were made. */
  private build(): FarmReplicaState {
    const { rules } = this.deps;
    const state = drawPending(rules, this.confirmed, this.lastSeq, this.pending);
    return {
      farm: this.deps.farm,
      lastSeq: this.lastSeq,
      state,
      confirmed: this.confirmed,
      pending: this.pending.map((e) => ({
        opId: e.opId,
        kind: e.kind,
        payload: e.payload,
        createdAt: e.createdAt,
        acked: e.ackedSeq !== null,
      })),
      presence: this.presence,
      typing: this.typing,
    };
  }

  private refresh(): void {
    this.current = this.build();
    for (const listener of this.listeners) listener();
  }
}
