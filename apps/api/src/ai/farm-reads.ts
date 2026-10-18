import {
  type EventEnvelope,
  type FarmId,
  type FarmState,
  type PersonId,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { farmStub } from '../farm/http';
import type { WirePage } from '../farm/history';

/*
 * What the AI jobs read from a farm object: its state, one event, and a run of its history. The
 * farm answers history only to someone who lives there, so each read names a member.
 */

export type Envelope = WirePage['events'][number];

/** The farm's state as the reducer leaves it, or null when there is no such farm. */
export const farmState = (env: Bindings, farm: FarmId): Promise<FarmState | null> =>
  farmStub(env, farm).state();

/** One event by its seq, read as `reader`; null when it isn't there or the reader can't read it. */
export async function eventAt(
  env: Bindings,
  farm: FarmId,
  reader: PersonId,
  seq: number,
): Promise<Envelope | null> {
  const page = await farmStub(env, farm).page(reader, { after: seq - 1, limit: 1 });
  const event = page?.events[0];
  return event !== undefined && event.seq === seq ? event : null;
}

/** At most this many pages of history for one week: a very busy farm's letter reads the latest. */
const WEEK_PAGES = 20;

/**
 * The events from the farm day `from` to the end of the log, oldest first, read newest first, as
 * `reader`. Null when the reader can't read the farm.
 */
export async function eventsSince(
  env: Bindings,
  farm: FarmId,
  reader: PersonId,
  from: string,
): Promise<Envelope[] | null> {
  const stub = farmStub(env, farm);
  const found: Envelope[] = [];
  let before: number | undefined;
  for (let i = 0; i < WEEK_PAGES; i += 1) {
    const page: WirePage | null = await stub.page(reader, {
      limit: 200,
      ...(before === undefined ? {} : { before }),
    });
    if (page === null) return i === 0 ? null : found.reverse();
    for (const event of [...page.events].reverse()) {
      const day = (event as EventEnvelope).day;
      if (day !== undefined && day < from) return found.reverse();
      found.push(event);
    }
    const oldest = page.events[0];
    if (!page.more || oldest === undefined) break;
    before = oldest.seq;
  }
  return found.reverse();
}
