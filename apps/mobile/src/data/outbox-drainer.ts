import type { FarmId } from '@kithfield/contracts';

import type { ApiClient } from './api-client';
import { failure, type SyncReport } from './apply-events';
import { SOCKET_BACKOFF, backoffDelay, type BackoffOptions } from './backoff';
import type { FarmReplica } from './farm-replica';
import { drainOverHttp, type DrainOutcome } from './http-drain';
import type { SyncStore } from './sync-store';

export interface OutboxDrainerDeps {
  readonly store: SyncStore;
  readonly replica: (farm: FarmId) => Promise<FarmReplica<unknown>>;
  readonly api: ApiClient;
  /** The farm whose socket is open sends its own outbox. */
  readonly isOpen: (farm: FarmId) => boolean;
  /** A drain ended the session or found the person banned. */
  readonly onOutcome: (farm: FarmId, outcome: DrainOutcome) => void;
  readonly report: (report: SyncReport) => void;
  readonly backoff?: BackoffOptions;
  readonly random?: () => number;
}

/**
 * Sends the outbox of every farm without an open socket over HTTP: at start, on returning to the
 * foreground, after a write, and again on a back-off timer while unsent writes remain. A farm the
 * person can no longer write to is skipped (its writes were already turned into rejections).
 */
export function createOutboxDrainer(deps: OutboxDrainerDeps) {
  const closed = new Set<FarmId>();
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function pass(): Promise<boolean> {
    let remaining = false;
    for (const farm of await deps.store.outboxFarms()) {
      if (closed.has(farm) || deps.isOpen(farm)) continue;
      const replica = await deps.replica(farm);
      const outcome = await drainOverHttp(replica, deps.api);
      if (outcome === 'not_member' || outcome === 'not_found') closed.add(farm);
      if (outcome !== 'done') deps.onOutcome(farm, outcome);
      if (outcome === 'session_ended' || outcome === 'banned') return false;
      if (replica.unsent().length > 0) remaining = true;
    }
    return remaining;
  }

  function schedule(remaining: boolean) {
    clearTimeout(timer);
    if (!remaining || stopped) {
      failures = 0;
      return;
    }
    failures += 1;
    const delay = backoffDelay(failures, deps.backoff ?? SOCKET_BACKOFF, deps.random);
    timer = setTimeout(() => void drainAll(), delay);
  }

  /** One pass over every farm's outbox; overlapping calls fold into one more pass. */
  function drainAll(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          schedule(await pass());
        } catch (error) {
          deps.report(failure('outbox.drain', error));
          schedule(true);
        }
      } while (again && !stopped);
      running = null;
    })();
    return running;
  }

  return {
    drainAll,
    /** Whether a farm's outbox was closed by the server (not a member, gone). */
    isClosed: (farm: FarmId) => closed.has(farm),
    close: (farm: FarmId) => closed.add(farm),
    stop(): void {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

export type OutboxDrainer = ReturnType<typeof createOutboxDrainer>;
