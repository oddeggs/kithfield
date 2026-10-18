import type { FarmId, FarmState, OpId, PersonId, RejectReason } from '@kithfield/contracts';

import type { BatchOutcome, SyncReport } from './apply-events';
import type { FarmRules } from './farm-rules';
import type { StoredRejection, SyncStore } from './sync-store';

/** What a received frame asks of the connection. */
export interface FrameOutcome extends Partial<BatchOutcome> {
  /** The last catch-up batch has landed: the phone is up to date. */
  readonly caughtUp?: boolean;
}

/** A write the phone has made and the farm has not yet answered or shown back. */
export interface PendingWrite {
  readonly opId: OpId;
  readonly kind: string;
  readonly payload: unknown;
  readonly createdAt: number;
  /** The farm acknowledged it; its event is on the way. */
  readonly acked: boolean;
}

/** One farm as the UI reads it. A new object on every change. */
export interface FarmReplicaState {
  readonly farm: FarmId;
  /** The last seq the phone holds. */
  readonly lastSeq: number;
  /** The farm with this phone's pending writes drawn in (optimistic). Null until first synced. */
  readonly state: FarmState | null;
  /** The farm as the server has confirmed it, up to `lastSeq`. */
  readonly confirmed: FarmState | null;
  readonly pending: readonly PendingWrite[];
  /** Whose farm is open right now and who is writing. Never stored. */
  readonly presence: readonly PersonId[];
  readonly typing: readonly PersonId[];
}

export type EnqueueResult =
  | { readonly status: 'queued'; readonly opId: OpId }
  /** The shared rules say the farm would refuse it; nothing was queued. */
  | { readonly status: 'refused'; readonly reason: RejectReason };

export interface FarmReplicaDeps<View> {
  readonly farm: FarmId;
  readonly store: SyncStore;
  readonly rules: FarmRules<View>;
  readonly newOpId: () => OpId;
  readonly now: () => number;
  /** Problems worth knowing about, never with content. */
  readonly report: (report: SyncReport) => void;
  /** A write the farm refused: final, already dropped from the outbox. */
  readonly onRejected: (rejection: StoredRejection) => void;
}
