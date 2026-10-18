import type { CottageDelivery, FarmState, Lang } from '@kithfield/contracts';
import { t } from '@kithfield/i18n';

import type { Bindings } from '../env';
import { type ApnsConfig, apnsConfig, type LiveActivityPush, sendLiveActivity } from '../push/apns';
import { holdUntil } from '../push/policy';
import {
  endPayload,
  FIRE_OUT,
  goingTo,
  planDayAttributes,
  planDayState,
  planDayWindow,
  startPayload,
  updatePayload,
} from '../surfaces/live-activity';
import * as activities from './activities';
import { isMuted, knockForOf, knowsFarm } from './chats';
import type { Intake } from './intake';
import { quietOf, readProfile } from './profile';

/*
 * The person's Live Activities, moved from the server when their phone isn't running the app:
 * a sprouted plan's day starts on their phones 2 hours before it (push-to-start, once quiet hours
 * allow), each change of who's there or on their way updates it, and it ends 2 hours after; the
 * fire's activity ends when the fire goes out. All of it needs the team's APNs key; without it,
 * nothing here runs and the activities move only while the app does.
 */

/** The edges, replaced in tests: the network and the farm's state. */
export const activityPorts = {
  config: (env: Bindings): ApnsConfig | null => apnsConfig(env),
  fetch: ((input, init) => fetch(input, init)) as typeof fetch,
  farmState: async (env: Bindings, farm: string): Promise<FarmState | null> =>
    env.FARM.get(env.FARM.idFromName(farm)).state(),
};

/** Events that can change a plan's day, who is going, or who is there. */
const PLAN_KINDS = new Set(['seed_planted', 'seed_changed', 'vote', 'rsvp', 'checkin', 'unsent']);

type PlanDayRow = {
  readonly farm: string;
  readonly seed: number;
  readonly start_at: number;
  readonly end_at: number;
  readonly started: number;
  readonly last_json: string | null;
};

/** `t` for a key that may not be in the catalogue yet: null instead of the key itself. */
function copy(lang: Lang, key: string, params: Record<string, string>): string | null {
  const lookup = t as unknown as (l: Lang, k: string, p: Record<string, string>) => string;
  const text = lookup(lang, key, params);
  return text === key ? null : text;
}

async function sendAll(
  intake: Intake,
  config: ApnsConfig,
  pushes: readonly LiveActivityPush[],
): Promise<void> {
  for (const push of pushes) {
    const result = await sendLiveActivity(activityPorts.fetch, config, push, intake.now);
    if (result.kind === 'dead') activities.dropDeadToken(intake.sql, push.token);
    else if (result.kind === 'failed') {
      console.error('live activity push failed', { reason: result.reason });
    }
  }
}

/**
 * Whether a plan's day may start on the person's phones from the server: never for a farm the
 * cottage doesn't know, a muted farm, plans turned off in its "Knock for", or while hibernating.
 * The app still starts it itself when the person opens it on the day.
 */
export function mayStartOn(sql: SqlStorage, farm: string, now: number): boolean {
  if (!knowsFarm(sql, farm) || isMuted(sql, farm, now)) return false;
  if (!knockForOf(sql, farm).plans) return false;
  return !readProfile(sql).hibernating;
}

/** A farm event that may move one of the person's activities. Never throws: a nicety. */
export async function considerActivities(intake: Intake, delivery: CottageDelivery): Promise<void> {
  const config = activityPorts.config(intake.env);
  if (config === null) return;
  try {
    if (delivery.kind === 'fire') await fireChanged(intake, config, delivery.farm);
    else if (PLAN_KINDS.has(delivery.kind)) await plansChanged(intake, config, delivery.farm);
  } catch (error) {
    console.error('live activity update failed', { error: String(error) });
  }
}

async function fireChanged(intake: Intake, config: ApnsConfig, farm: string): Promise<void> {
  const tokens = activities.activityTokens(intake.sql, { activity: 'fire', farm });
  if (tokens.length === 0) return;
  const state = await activityPorts.farmState(intake.env, farm);
  if (state === null || state.fireLitAt !== null) return;
  const payload = endPayload(FIRE_OUT, intake.now);
  await sendAll(
    intake,
    config,
    tokens.map(({ token }) => ({ token, payload, priority: 10 })),
  );
  for (const { device } of tokens) {
    activities.dropActivityToken(intake.sql, device, { activity: 'fire', farm });
  }
}

/**
 * Plans on a farm changed: schedule the person's plan days afresh (the ones they're going to that
 * have sprouted), and update each running plan-day activity whose people changed.
 */
async function plansChanged(intake: Intake, config: ApnsConfig, farm: string): Promise<void> {
  const { sql, person, now } = intake;
  const followed = activities.followedSeeds(sql, farm);
  const canStart = activities.startTokens(sql).length > 0 && mayStartOn(sql, farm, now);
  if (followed.length === 0 && !canStart) return;
  const state = await activityPorts.farmState(intake.env, farm);
  if (state === null) return;

  const going = new Set<number>();
  for (const seed of state.seeds) {
    const window = planDayWindow(state, seed);
    // A day is kept for one that may start, and for one already running (to move it along).
    if (!canStart && !followed.includes(seed.seq)) continue;
    if (window === null || window.endAt <= now || !goingTo(seed, person)) continue;
    going.add(seed.seq);
    sql.exec(
      `INSERT INTO plan_days (farm, seed, start_at, end_at, started) VALUES (?, ?, ?, ?, 0)
       ON CONFLICT (farm, seed) DO UPDATE SET start_at = excluded.start_at, end_at = excluded.end_at`,
      farm,
      seed.seq,
      window.startAt,
      window.endAt,
    );
  }
  for (const row of rowsOn(sql, farm)) {
    if (!going.has(row.seed) && row.started === 0) {
      sql.exec('DELETE FROM plan_days WHERE farm = ? AND seed = ?', farm, row.seed);
    }
  }

  for (const seq of followed) {
    const seed = state.seeds.find((s) => s.seq === seq);
    if (seed === undefined) continue;
    const json = JSON.stringify(planDayState(state, seed));
    const row = rowsOn(sql, farm).find((r) => r.seed === seq);
    if (row?.last_json === json) continue;
    const tokens = activities.activityTokens(sql, { activity: 'plan_day', farm, seed: seq });
    const payload = { ...updatePayload(JSON.parse(json), now) };
    await sendAll(
      intake,
      config,
      tokens.map(({ token }) => ({ token, payload, priority: 10 })),
    );
    sql.exec('UPDATE plan_days SET last_json = ? WHERE farm = ? AND seed = ?', json, farm, seq);
  }
}

function rowsOn(sql: SqlStorage, farm: string): PlanDayRow[] {
  return sql.exec<PlanDayRow>('SELECT * FROM plan_days WHERE farm = ?', farm).toArray();
}

/**
 * The cottage's alarm: starts the plan days that are due (once quiet hours allow, and only while
 * the day lasts) and ends the ones that are over. False when something failed.
 */
export async function ringActivities(intake: Intake): Promise<void> {
  const { sql, now, env } = intake;
  const config = activityPorts.config(env);
  const rows = sql.exec<PlanDayRow>('SELECT * FROM plan_days ORDER BY start_at').toArray();
  for (const row of rows) {
    if (row.end_at <= now) {
      await endPlanDay(intake, config, row);
      continue;
    }
    if (row.started === 1 || row.start_at > now || config === null) continue;
    const quietUntil = holdUntil(now, quietOf(readProfile(sql)));
    if (quietUntil !== null) {
      sql.exec(
        'UPDATE plan_days SET start_at = ? WHERE farm = ? AND seed = ?',
        quietUntil,
        row.farm,
        row.seed,
      );
      continue;
    }
    await startPlanDay(intake, config, row);
  }
}

async function startPlanDay(intake: Intake, config: ApnsConfig, row: PlanDayRow): Promise<void> {
  const { sql, now, env } = intake;
  sql.exec('UPDATE plan_days SET started = 1 WHERE farm = ? AND seed = ?', row.farm, row.seed);
  if (!mayStartOn(sql, row.farm, now)) return;
  const state = await activityPorts.farmState(env, row.farm);
  const seed = state?.seeds.find((s) => s.seq === row.seed);
  const window = state && seed ? planDayWindow(state, seed) : null;
  if (!state || !seed || !window || !goingTo(seed, intake.person)) return;
  const attributes = planDayAttributes(env.ENVIRONMENT, state, seed, window);
  const people = planDayState(state, seed);
  const lang = readProfile(sql).settings.lang;
  const body =
    copy(lang, 'push.planDay.start', { title: attributes.title }) ?? attributes.place ?? '';
  const payload = startPayload(
    attributes,
    people,
    { title: attributes.title, body },
    now,
    window.endAt,
  );
  await sendAll(
    intake,
    config,
    activities.startTokens(sql).map(({ token }) => ({ token, payload, priority: 10 })),
  );
  sql.exec(
    'UPDATE plan_days SET last_json = ? WHERE farm = ? AND seed = ?',
    JSON.stringify(people),
    row.farm,
    row.seed,
  );
}

async function endPlanDay(intake: Intake, config: ApnsConfig | null, row: PlanDayRow) {
  const { sql, now } = intake;
  const key = { activity: 'plan_day', farm: row.farm, seed: row.seed } as const;
  const tokens = activities.activityTokens(sql, key);
  if (config !== null && tokens.length > 0) {
    const last: unknown =
      row.last_json === null ? { here: [], onTheWay: [] } : JSON.parse(row.last_json);
    const payload = endPayload(last, now);
    await sendAll(
      intake,
      config,
      tokens.map(({ token }) => ({ token, payload, priority: 5 })),
    );
  }
  for (const { device } of tokens) activities.dropActivityToken(sql, device, key);
  sql.exec('DELETE FROM plan_days WHERE farm = ? AND seed = ?', row.farm, row.seed);
}

/** When the next plan day starts or ends, or null. */
export function nextActivityAt(sql: SqlStorage): number | null {
  return sql
    .exec<{ at: number | null }>(
      'SELECT min(CASE WHEN started = 0 THEN min(start_at, end_at) ELSE end_at END) AS at FROM plan_days',
    )
    .one().at;
}
