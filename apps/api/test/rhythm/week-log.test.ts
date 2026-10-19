import type { FarmEvent } from '@kithfield/contracts';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { FarmStore } from '../../src/farm/store';
import { eventsBetween, firstSeqFrom } from '../../src/rhythm/week-log';
import { op } from '../farm/support/client';
import { farmStub, freshFarmId } from '../farm/support/doubles';

/*
 * Farm days in the log are the days stamped on its events, whatever the farm's time zone is now:
 * a farm that moved zones keeps the days it lived.
 */

const H = 3_600_000;

/** A message on the log at `at`, stamped with `day` (none for a log from before days existed). */
const message = (seq: number, at: number, day: string | null): FarmEvent => ({
  seq,
  opId: op(seq, 7),
  at,
  ...(day === null ? {} : { day }),
  actor: 'p_one',
  kind: 'message',
  payload: { text: `m${seq}` },
  rulesVersion: day === null ? 1 : 4,
});

/** A log written straight into a fresh farm object's storage, read with `read`. */
const withLog = <T>(events: FarmEvent[], read: (store: FarmStore) => T) =>
  runInDurableObject(farmStub(freshFarmId()), (_farm, state) => {
    const store = new FarmStore(state.storage.sql);
    for (const event of events) store.insert(event);
    return read(store);
  });

describe('the days of the log', () => {
  it('are the days stamped on events, across a move from ahead of Greenwich to behind it', async () => {
    // Kiritimati (UTC+14) until the evening of the 20th there, then Honolulu (UTC−10): read in
    // Honolulu's zone, the first two would fall on the 19th.
    const morning = Date.UTC(2054, 9, 19, 20, 0); // 10:00 on the 20th in Kiritimati
    const log = [
      message(1, morning, '2054-10-20'),
      message(2, morning + H, '2054-10-20'),
      message(3, morning + 8 * H, '2054-10-20'), // after the move: still the farm's 20th
      message(4, morning + 30 * H, '2054-10-21'),
    ];
    const read = await withLog(log, (store) => ({
      from19: firstSeqFrom(store, '2054-10-19'),
      from20: firstSeqFrom(store, '2054-10-20'),
      from21: firstSeqFrom(store, '2054-10-21'),
      on20: eventsBetween(store, '2054-10-20', '2054-10-20', ['message']).map((e) => e.seq),
    }));
    expect(read).toEqual({ from19: 1, from20: 1, from21: 4, on20: [1, 2, 3] });
  });

  it('count events from before days were stamped before every day, whatever the zone now', async () => {
    // Undated events at 10:00 on the 19th in Honolulu: the 20th by Kiritimati's clock, where the
    // farm lives now. They never decide where a stamped day starts.
    const at = Date.UTC(2054, 9, 19, 20, 0);
    const log = [
      message(1, at, null),
      message(2, at + H, null),
      message(3, at + 2 * H, null),
      message(4, at + 3 * H, '2054-10-19'),
      message(5, at + 4 * H, '2054-10-19'),
      message(6, at + 30 * H, '2054-10-20'),
      message(7, at + 31 * H, '2054-10-20'),
    ];
    const read = await withLog(log, (store) => ({
      from19: firstSeqFrom(store, '2054-10-19'),
      from20: firstSeqFrom(store, '2054-10-20'),
      on19: eventsBetween(store, '2054-10-19', '2054-10-19', ['message']).map((e) => e.seq),
      on20: eventsBetween(store, '2054-10-20', '2054-10-20', ['message']).map((e) => e.seq),
    }));
    expect(read).toEqual({ from19: 4, from20: 6, on19: [4, 5], on20: [6, 7] });
  });
});
