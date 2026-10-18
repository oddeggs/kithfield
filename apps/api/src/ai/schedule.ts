import { EpochMs, FarmId, Lang, type RecapJob } from '@kithfield/contracts';
import { z } from 'zod';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { consentingMembers, currentMembers } from './consent';
import { farmState } from './farm-reads';
import { letterQueued } from './recap';
import { dropFarm } from './store';

/*
 * When the Sunday letters are queued. The hourly cron puts a `recap_due` message on the `ai` queue
 * for each farm that is due, so one run never does every farm's work itself; its consumer looks at
 * the farm in its own time zone and, once Sunday 09:00 has passed for a week not yet queued, queues
 * a `RecapJob` for the week ending that Sunday. A late run still queues it, until the next Sunday
 * takes over. A farm where nobody said yes to `recap` gets no job. Visits have no recap. A farm
 * that is gone takes everything the AI made for it with it.
 */

/** On the `ai` queue: look at one farm's Sunday letter. Local to the API. */
export const RecapDueJob = z.object({ kind: z.literal('recap_due'), farm: FarmId, at: EpochMs });
export type RecapDueJob = z.infer<typeof RecapDueJob>;

/** The letter is queued from this hour on Sunday, farm time. */
export const RECAP_HOUR = 9;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** At most this many farms are sent to be looked at in one cron run; the rest follow the next hour. */
const FARMS_PER_RUN = 2000;

/** Messages per `sendBatch`, the queue's limit. */
const SEND_BATCH = 100;

type LocalParts = { date: string; weekday: number; hour: number; minute: number };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The calendar date, weekday (Sunday 0), hour and minute at `at` in a time zone. */
export function localParts(at: number, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

/** The Sunday (`YYYY-MM-DD`) of the latest week whose letter hour has passed, farm time. */
export function latestWeek(local: LocalParts): string {
  const back = local.weekday === 0 && local.hour >= RECAP_HOUR ? 0 : local.weekday || 7;
  return new Date(Date.parse(`${local.date}T00:00:00Z`) - back * DAY_MS).toISOString().slice(0, 10);
}

/**
 * About when Sunday's letter hour next comes round, from `now`. A daylight-saving change may make
 * it an hour early; the farm is then simply looked at again an hour later.
 */
export function nextSundayMorning(now: number, local: LocalParts): number {
  let days = (7 - local.weekday) % 7;
  if (days === 0 && local.hour >= RECAP_HOUR) days = 7;
  return now + days * DAY_MS + (RECAP_HOUR - local.hour) * HOUR_MS - local.minute * 60_000;
}

/** The languages the farm's members read, for the letter. */
async function langsOf(env: Bindings, farm: FarmId): Promise<Lang[]> {
  const langs = new Set<Lang>();
  for (const person of await currentMembers(env.DB, farm)) {
    const settings = await cottageOf(env, person)
      .settings()
      .catch(() => null);
    const lang = Lang.safeParse(settings?.settings.lang);
    if (lang.success) langs.add(lang.data);
  }
  return langs.size === 0 ? ['en'] : [...langs];
}

/** Queues the week's letter if anyone on the farm said yes to `recap`; true when it did. */
export async function queueRecap(
  env: Bindings,
  farm: FarmId,
  week: string,
  now: number,
): Promise<boolean> {
  if ((await consentingMembers(env.DB, farm, 'recap')).length === 0) return false;
  const langs = await langsOf(env, farm);
  await letterQueued(env.DB, farm, week, langs, now);
  const job: RecapJob = { kind: 'recap', farm, week, langs, at: now };
  await env.AI_QUEUE.send(job);
  return true;
}

type ScheduleRow = { farm_id: string; next_at: number | null; last_week: string | null };

/** The hourly cron: sends each farm that is due to be looked at. */
export async function queueDueRecaps(env: Bindings, now: number): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO recap_schedule (farm_id)
     SELECT id FROM farms WHERE kind = 'farm' AND id NOT IN (SELECT farm_id FROM recap_schedule)`,
  ).run();
  const { results } = await env.DB.prepare(
    'SELECT farm_id FROM recap_schedule WHERE next_at IS NULL OR next_at <= ? LIMIT ?',
  )
    .bind(now, FARMS_PER_RUN)
    .all<{ farm_id: string }>();
  for (let i = 0; i < results.length; i += SEND_BATCH) {
    const farms = results.slice(i, i + SEND_BATCH).map((r) => r.farm_id);
    await env.AI_QUEUE.sendBatch(
      farms.map((farm) => ({ body: { kind: 'recap_due', farm, at: now } satisfies RecapDueJob })),
    );
    // Not sent again next hour while its message waits; the consumer sets the real time.
    await env.DB.batch(
      farms.map((farm) =>
        env.DB.prepare('UPDATE recap_schedule SET next_at = ? WHERE farm_id = ?').bind(
          now + HOUR_MS,
          farm,
        ),
      ),
    );
  }
}

/**
 * Looks at one farm at `now`: queues the latest week's letter once its hour has passed and it
 * hasn't been queued, and sets when to look again. A farm seen for the first time only learns its
 * zone, and its first letter is the next Sunday's.
 */
export async function scheduleFarm(env: Bindings, farm: FarmId, now: number): Promise<void> {
  const state = await farmState(env, farm);
  if (state === null) {
    await dropFarm(env, farm);
    return;
  }
  const row = await env.DB.prepare(
    'SELECT farm_id, next_at, last_week FROM recap_schedule WHERE farm_id = ?',
  )
    .bind(farm)
    .first<ScheduleRow>();
  const local = localParts(now, state.timeZone);
  const week = latestWeek(local);
  const lastWeek = row?.last_week ?? null;
  if (lastWeek !== null && lastWeek < week) await queueRecap(env, farm, week, now);
  await env.DB.prepare(
    `INSERT INTO recap_schedule (farm_id, next_at, last_week) VALUES (?1, ?2, ?3)
     ON CONFLICT (farm_id) DO UPDATE SET next_at = ?2, last_week = ?3`,
  )
    .bind(
      farm,
      nextSundayMorning(now, local),
      lastWeek === null || lastWeek < week ? week : lastWeek,
    )
    .run();
}
