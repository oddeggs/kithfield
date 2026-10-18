import { type FarmId, Lang, type RecapJob } from '@kithfield/contracts';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { consentingMembers, currentMembers } from './consent';
import { farmState } from './farm-reads';
import { letterQueued } from './recap';

/*
 * When the Sunday letters are queued: the hourly cron looks at each farm that is due and, on Sunday
 * morning in the farm's own time zone, queues a `RecapJob` for the week ending that day. A farm
 * where nobody said yes to `recap` gets no job. Visits have no recap.
 */

/** The letter is queued from this hour on Sunday, farm time. */
export const RECAP_HOUR = 9;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** At most this many farms are looked at in one cron run; the rest follow the next hour. */
const FARMS_PER_RUN = 500;

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

/** The hourly look at which farms' Sunday letters are due. */
export async function queueDueRecaps(env: Bindings, now: number): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO recap_schedule (farm_id)
     SELECT id FROM farms WHERE kind = 'farm' AND id NOT IN (SELECT farm_id FROM recap_schedule)`,
  ).run();
  const { results } = await env.DB.prepare(
    'SELECT farm_id, next_at, last_week FROM recap_schedule WHERE next_at IS NULL OR next_at <= ? LIMIT ?',
  )
    .bind(now, FARMS_PER_RUN)
    .all<ScheduleRow>();
  for (const row of results) {
    try {
      const state = await farmState(env, row.farm_id);
      if (state === null) {
        await env.DB.prepare('DELETE FROM recap_schedule WHERE farm_id = ?')
          .bind(row.farm_id)
          .run();
        continue;
      }
      const local = localParts(now, state.timeZone);
      let lastWeek = row.last_week;
      // A farm seen for the first time only learns its zone: its first letter is next Sunday's.
      const due =
        row.next_at !== null &&
        local.weekday === 0 &&
        local.hour >= RECAP_HOUR &&
        lastWeek !== local.date;
      if (due) {
        await queueRecap(env, row.farm_id, local.date, now);
        lastWeek = local.date;
      }
      await env.DB.prepare('UPDATE recap_schedule SET next_at = ?, last_week = ? WHERE farm_id = ?')
        .bind(nextSundayMorning(now, local), lastWeek, row.farm_id)
        .run();
    } catch (error) {
      console.error('recap scheduling failed', {
        farm: row.farm_id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
