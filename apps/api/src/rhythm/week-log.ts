import { type EventKind, FarmEvent, type LocalDate } from '@kithfield/contracts';
import { addDays } from '@kithfield/farm';

import type { FarmStore } from '../farm/store';

/*
 * A stretch of farm days in the log. Each event's `day` is the farm's day when it was committed,
 * so days only rise with seq, even across a change of time zone: the first event of a day is found
 * by bisecting seqs, with no scan of the log. A day is never worked out from an event's time in the
 * farm's zone now, which may not be the zone it was written in. Events from before `day` existed
 * (development logs only, all at the log's start) count before every day.
 */

const READ_BATCH = 1000;

/** Sorts before every day. */
const UNDATED = '';

const dayOf = (store: FarmStore, seq: number): LocalDate | null => {
  const event = store.event(seq);
  if (event === null) return null;
  return event.day ?? UNDATED;
};

/** The first seq whose day is `day` or later; one past the head when there is none. */
export const firstSeqFrom = (store: FarmStore, day: LocalDate): number => {
  let lo = 1;
  let hi = store.head() + 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const found = dayOf(store, mid);
    if (found !== null && found < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * The events of the given kinds from `from` through `to` (farm days, both included), oldest first.
 * Envelopes this server can't read as a farm event are skipped.
 */
export const eventsBetween = (
  store: FarmStore,
  from: LocalDate,
  to: LocalDate,
  kinds: readonly EventKind[],
): FarmEvent[] => {
  const first = firstSeqFrom(store, from);
  const end = firstSeqFrom(store, addDays(to, 1));
  const events: FarmEvent[] = [];
  let after = first - 1;
  for (;;) {
    const batch = store.after(after, READ_BATCH, kinds, end);
    for (const envelope of batch) {
      const parsed = FarmEvent.safeParse(envelope);
      if (parsed.success) events.push(parsed.data);
    }
    const last = batch.at(-1);
    if (last === undefined || batch.length < READ_BATCH) return events;
    after = last.seq;
  }
};
