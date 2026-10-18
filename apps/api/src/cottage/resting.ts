import type { NotificationType, PushJob } from '@kithfield/contracts';

import { notificationTypeOf, tag } from '../push/catalogue';
import { DAY_MS } from '../push/policy';

/*
 * Kinds of push that rest after going unopened (`10 On the System`: "If 3 in a row go unopened,
 * we pause that type for a week and say so in 11-08"). The cottage remembers each push it hands
 * the consumer by the id in its data; the app reports opens (`POST /v1/push/opened`). When the
 * last three pushes of a kind from a farm all went unopened, the next one starts that kind's rest
 * on the farm instead of going out. Pushes that belong to no farm (nudges) rest everywhere.
 */

/** Unopened pushes of one kind in a row before it rests. */
export const UNOPENED_BEFORE_REST = 3;
/** How long a kind rests. */
export const REST_MS = 7 * DAY_MS;
/** Sent pushes are remembered this long. */
const SENT_KEEP_MS = 60 * DAY_MS;

/** A push with no farm is kept under the empty farm key. */
const farmKey = (farm: string | null) => farm ?? '';

/**
 * The id a push carries in its data: the same for the same job, so a send the consumer retries is
 * remembered once.
 */
export function pushIdOf(job: PushJob): string {
  return `p${tag(`${job.person}\n${job.collapseKey}\n${job.seq ?? ''}\n${job.at}`)}`;
}

/** Remembers a push handed over to be sent. Pushes of no kind (knocks, seeds) aren't kept. */
export function rememberSent(sql: SqlStorage, job: PushJob, id: string, now: number): void {
  const type = notificationTypeOf(job);
  sql.exec('DELETE FROM sent_pushes WHERE at < ?', now - SENT_KEEP_MS);
  if (type === null) return;
  sql.exec(
    'INSERT OR IGNORE INTO sent_pushes (id, farm, type, at) VALUES (?, ?, ?, ?)',
    id,
    farmKey(job.farm),
    type,
    now,
  );
}

/** The person opened a push. An unknown id changes nothing. */
export function markOpened(sql: SqlStorage, id: string): void {
  sql.exec('UPDATE sent_pushes SET opened = 1 WHERE id = ?', id);
}

function restRow(sql: SqlStorage, farm: string, type: NotificationType) {
  return sql
    .exec<{
      until: number | null;
      since: number;
    }>('SELECT until, since FROM resting WHERE farm = ? AND type = ?', farm, type)
    .toArray()[0];
}

/** Whether the job's kind rests on its farm now, without starting a rest. */
export function isResting(sql: SqlStorage, job: PushJob, now: number): boolean {
  const type = notificationTypeOf(job);
  if (type === null) return false;
  const until = restRow(sql, farmKey(job.farm), type)?.until ?? null;
  return until !== null && until > now;
}

/**
 * Whether the job's kind rests on its farm, starting a rest when the last three pushes of that
 * kind there (since the last rest or turning back on) all went unopened.
 */
export function restsNow(sql: SqlStorage, job: PushJob, now: number): boolean {
  const type = notificationTypeOf(job);
  if (type === null) return false;
  const farm = farmKey(job.farm);
  const row = restRow(sql, farm, type);
  if (row?.until != null && row.until > now) return true;
  const last = sql
    .exec<{ opened: number }>(
      `SELECT opened FROM sent_pushes WHERE farm = ? AND type = ? AND at > ?
       ORDER BY at DESC, rowid DESC LIMIT ?`,
      farm,
      type,
      row?.since ?? -1,
      UNOPENED_BEFORE_REST,
    )
    .toArray();
  if (last.length < UNOPENED_BEFORE_REST || last.some((r) => r.opened === 1)) return false;
  sql.exec(
    `INSERT INTO resting (farm, type, until, since) VALUES (?, ?, ?, ?)
     ON CONFLICT (farm, type) DO UPDATE SET until = excluded.until, since = excluded.since`,
    farm,
    type,
    now + REST_MS,
    now,
  );
  return true;
}

/** The kinds resting on a farm now, with when each wakes; nudges rest on every farm. */
export function restingOn(
  sql: SqlStorage,
  farm: string,
  now: number,
): { type: NotificationType; until: number }[] {
  return sql
    .exec<{ type: NotificationType; until: number }>(
      `SELECT type, max(until) AS until FROM resting
       WHERE farm IN (?, '') AND until > ? GROUP BY type ORDER BY type`,
      farm,
      now,
    )
    .toArray();
}

/** Turns a resting kind back on for a farm (nudges everywhere); only later pushes count again. */
export function wake(sql: SqlStorage, farm: string, type: NotificationType, now: number): void {
  const farms = type === 'nudges' ? [farm, ''] : [farm];
  for (const key of farms) {
    sql.exec(
      `INSERT INTO resting (farm, type, until, since) VALUES (?, ?, NULL, ?)
       ON CONFLICT (farm, type) DO UPDATE SET until = NULL, since = excluded.since`,
      key,
      type,
      now,
    );
  }
}
