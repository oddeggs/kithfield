import { ApiError, isTransient, type ApiClient } from './api-client';
import type { FarmReplica } from './farm-replica';

/**
 * How an HTTP drain ended: `done`; `later` (no network, rate limited, server trouble); the farm
 * is closed to this person (`not_member`, `not_found`: its outbox became rejections); or the
 * session is over (`session_ended`, `banned`).
 */
export type DrainOutcome =
  'done' | 'later' | 'session_ended' | 'banned' | 'not_member' | 'not_found';

type Verdict = 'later' | 'session_ended' | 'banned' | 'final' | 'not_member' | 'not_found';

/** What an API failure means for the farm's outbox. */
function verdictOf(error: unknown): Verdict {
  if (isTransient(error) || !(error instanceof ApiError)) return 'later';
  if (error.status === 401) return 'session_ended';
  if (error.status === 403) return error.code === 'banned' ? 'banned' : 'not_member';
  if (error.status === 404) return 'not_found';
  return 'final';
}

/** Turns a failure that ends the farm (not a member, gone) into rejections of its whole outbox. */
async function settleFarmFailure(
  replica: FarmReplica,
  verdict: Verdict,
): Promise<DrainOutcome | null> {
  if (verdict === 'later' || verdict === 'session_ended' || verdict === 'banned') return verdict;
  if (verdict === 'final') return null;
  await replica.rejectAll(verdict);
  return verdict;
}

/**
 * Sends a farm's outbox over `POST /v1/farms/:id/cmd`, oldest first, then catches the log up over
 * HTTP paging, for when its socket can't connect or isn't open. Each write is sent as it was
 * made. A 4xx about one write (other than 401 and 429) is final for that write only.
 */
export async function drainOverHttp(replica: FarmReplica, api: ApiClient): Promise<DrainOutcome> {
  let settled = 0;
  for (const entry of replica.unsent()) {
    try {
      const result = await api.command(replica.farm, entry);
      await replica.settle(
        result.opId,
        result.result === 'ack' ? { seq: result.seq } : { reason: result.reason },
      );
      settled += 1;
    } catch (error) {
      const verdict = verdictOf(error);
      const ended = await settleFarmFailure(replica, verdict);
      if (ended) return ended;
      await replica.settle(entry.opId, { reason: 'invalid' });
    }
  }
  if (settled === 0) return 'done';
  try {
    await catchUpOverHttp(replica, api);
    return 'done';
  } catch (error) {
    return (await settleFarmFailure(replica, verdictOf(error))) ?? 'later';
  }
}

/** Pages the log in after `lastSeq` until the farm has nothing newer. */
export async function catchUpOverHttp(replica: FarmReplica, api: ApiClient): Promise<void> {
  // A farm waiting for its snapshot (an invalid event was skipped) can't catch up by events:
  // only the socket sends snapshots.
  if (replica.helloSeq() === 0 && replica.getState().lastSeq > 0) return;
  for (;;) {
    const page = await api.events(replica.farm, {
      after: replica.getState().lastSeq,
      limit: 200,
    });
    const outcome = await replica.applyPage(page.events);
    if (outcome.restore) {
      await pageInRestored(replica, api, outcome.restore);
      continue;
    }
    if (!page.more || outcome.resync || outcome.rulesOutdated) return;
  }
}

/** Pages an appeal's restored targets back in, with their payloads, before the restore applies. */
export async function pageInRestored(
  replica: FarmReplica,
  api: ApiClient,
  seqs: readonly number[],
): Promise<void> {
  for (const seq of seqs) {
    const page = await api.events(replica.farm, { after: seq - 1, limit: 1 });
    await replica.cacheHistory(page.events, [seq]);
  }
}
