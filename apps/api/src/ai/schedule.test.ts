import type { RecapJob } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cast, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import { getAiRecap } from './recap';
import {
  latestWeek,
  localParts,
  nextSundayMorning,
  queueDueRecaps,
  type RecapDueJob,
  scheduleFarm,
} from './schedule';
import { letterKey, putJson } from './store';
import { consent, deliver, ScriptedAi, watchAiQueue } from './support.test-data';

/* When the Sunday letters are queued, in each farm's own time zone. */

beforeEach(() => {
  useTestPorts();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const at = (day: number, hour: number, minute = 0) => Date.UTC(2054, 9, day, hour, minute);

async function aFarm() {
  const { pip, fig } = await cast('pip', 'fig');
  const { farm } = await plantFarm(pip, [fig]);
  await consent(pip, 'recap');
  return { farm };
}

const recapsFor = (queued: unknown[], farm: string) =>
  queued.filter((j) => (j as RecapJob).kind === 'recap' && (j as RecapJob).farm === farm);

const nextAt = async (farm: string) =>
  (
    await env.DB.prepare('SELECT next_at FROM recap_schedule WHERE farm_id = ?')
      .bind(farm)
      .first<{ next_at: number }>()
  )?.next_at;

describe('farm time', () => {
  it('works out Sunday morning in the farm’s own time zone', () => {
    // 23:30 on Saturday in London is already Sunday morning in Hanoi.
    const late = at(17, 22, 30);
    expect(localParts(late, 'Europe/London')).toMatchObject({ date: '2054-10-17', weekday: 6 });
    const hanoi = localParts(late, 'Asia/Ho_Chi_Minh');
    expect(hanoi).toEqual({ date: '2054-10-18', weekday: 0, hour: 5, minute: 30 });
    expect(nextSundayMorning(late, hanoi)).toBe(at(18, 2));
    // Before 09:00 on Sunday the latest week is last Sunday's; from 09:00, today's.
    expect(latestWeek(hanoi)).toBe('2054-10-11');
    expect(latestWeek({ ...hanoi, hour: 9, minute: 0 })).toBe('2054-10-18');
    expect(latestWeek({ date: '2054-10-20', weekday: 2, hour: 7, minute: 0 })).toBe('2054-10-18');
  });
});

describe('queueing the letters', () => {
  it('fans the hourly run out to one message per farm that is due', async () => {
    const queued = watchAiQueue();
    const { farm } = await aFarm();
    await queueDueRecaps(env, at(11, 8, 7));
    expect(queued).toContainEqual({
      kind: 'recap_due',
      farm,
      at: at(11, 8, 7),
    } satisfies RecapDueJob);
    // Not sent again while its message waits.
    expect(await nextAt(farm)).toBe(at(11, 9, 7));
    const before = queued.length;
    await queueDueRecaps(env, at(11, 8, 37));
    expect(queued.filter((j) => (j as RecapDueJob).farm === farm)).toHaveLength(1);
    expect(queued.length).toBeGreaterThanOrEqual(before);
  });

  it('queues a farm’s letter once on Sunday morning, farm time', async () => {
    const queued = watchAiQueue();
    const { farm } = await aFarm();
    // First seen on a Sunday morning: it learns its zone and waits for next Sunday.
    await deliver(new ScriptedAi(), [{ kind: 'recap_due', farm, at: at(11, 8, 30) }]);
    expect(recapsFor(queued, farm)).toEqual([]);
    // 09:00 on Sunday 18 October in London (British Summer Time).
    expect(await nextAt(farm)).toBe(at(18, 8));
    await scheduleFarm(env, farm, at(18, 8, 7));
    expect(recapsFor(queued, farm)).toEqual([
      expect.objectContaining({ kind: 'recap', farm, week: '2054-10-18', langs: ['en'] }),
    ]);
    await scheduleFarm(env, farm, at(18, 9, 7));
    expect(recapsFor(queued, farm)).toHaveLength(1);
  });

  it('keeps to 09:00 farm time across the clocks going back', async () => {
    const queued = watchAiQueue();
    const { farm } = await aFarm();
    await scheduleFarm(env, farm, at(18, 8, 30));
    // Summer time ends on 25 October: the estimate lands at 08:00 GMT, an hour early.
    expect(await nextAt(farm)).toBe(at(25, 8));
    await scheduleFarm(env, farm, at(25, 8));
    expect(recapsFor(queued, farm)).toEqual([]);
    expect(await nextAt(farm)).toBe(at(25, 9));
    await scheduleFarm(env, farm, at(25, 9));
    expect(recapsFor(queued, farm)).toEqual([
      expect.objectContaining({ farm, week: '2054-10-25' }),
    ]);
  });

  it('still queues a week whose Sunday the runs missed, until the next Sunday', async () => {
    const queued = watchAiQueue();
    const { farm } = await aFarm();
    await scheduleFarm(env, farm, at(11, 10));
    // No run on Sunday 18 October at all; Tuesday's finds the week not yet queued.
    await scheduleFarm(env, farm, at(20, 10));
    expect(recapsFor(queued, farm)).toEqual([
      expect.objectContaining({ farm, week: '2054-10-18' }),
    ]);
  });

  it('forgets everything the AI made for a farm that is gone', async () => {
    const gone = 'farmgone0000000000';
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO recap_letters (farm_id, week, lang, state, updated_at) VALUES (?, '2054-10-18', 'en', 'written', 1)",
      ).bind(gone),
      env.DB.prepare(
        "INSERT INTO recap_sources (farm_id, week, person_id) VALUES (?, '2054-10-18', 'someone')",
      ).bind(gone),
      env.DB.prepare(
        "INSERT INTO recap_schedule (farm_id, next_at, last_week) VALUES (?, 1, '2054-10-11')",
      ).bind(gone),
    ]);
    await putJson(env, letterKey(gone, '2054-10-18', 'en'), { lang: 'en', title: 't', body: 'b' });
    await scheduleFarm(env, gone, at(18, 10));
    expect(await getAiRecap(env, gone, '2054-10-18')).toEqual({
      letterState: 'none',
      letter: null,
    });
    expect(await env.MEDIA.head(letterKey(gone, '2054-10-18', 'en'))).toBeNull();
    const left = await env.DB.prepare(
      `SELECT (SELECT count(*) FROM recap_sources WHERE farm_id = ?1)
            + (SELECT count(*) FROM recap_schedule WHERE farm_id = ?1) AS n`,
    )
      .bind(gone)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
