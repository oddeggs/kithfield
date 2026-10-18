import type { ResponseTimes } from '@kithfield/contracts';

/*
 * How the desk is doing over a window: the median time to a first action, and targets met out
 * of those due (urgent within an hour, the rest within a day, appeals within a week). Never per
 * moderator.
 */

const DAY_MS = 24 * 60 * 60_000;
export const APPEAL_TARGET_MS = 7 * DAY_MS;

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round(value);
};

export async function responseTimes(
  db: D1Database,
  days: number,
  now: number,
): Promise<ResponseTimes> {
  const since = now - days * DAY_MS;
  const [reports, appeals] = await Promise.all([
    db
      .prepare(
        'SELECT urgent, received_at, due_at, first_action_at FROM reports WHERE received_at >= ?',
      )
      .bind(since)
      .all<{
        urgent: number;
        received_at: number;
        due_at: number;
        first_action_at: number | null;
      }>(),
    db
      .prepare('SELECT status, sent_at, decided_at FROM appeals WHERE sent_at >= ?')
      .bind(since)
      .all<{ status: string; sent_at: number; decided_at: number | null }>(),
  ]);

  const urgent = { met: 0, due: 0 };
  const standard = { met: 0, due: 0 };
  const firsts: number[] = [];
  for (const r of reports.results) {
    if (r.first_action_at !== null) firsts.push(r.first_action_at - r.received_at);
    // Due once it was handled or its time ran out.
    if (r.first_action_at === null && r.due_at > now) continue;
    const bucket = r.urgent === 1 ? urgent : standard;
    bucket.due += 1;
    if (r.first_action_at !== null && r.first_action_at <= r.due_at) bucket.met += 1;
  }

  const appealTarget = { met: 0, due: 0 };
  let overturned = 0;
  for (const a of appeals.results) {
    if (a.status === 'undone') overturned += 1;
    if (a.decided_at === null && a.sent_at + APPEAL_TARGET_MS > now) continue;
    appealTarget.due += 1;
    if (a.decided_at !== null && a.decided_at <= a.sent_at + APPEAL_TARGET_MS)
      appealTarget.met += 1;
  }

  return {
    days,
    medianFirstActionMs: median(firsts),
    urgentWithinHour: urgent,
    standardWithinDay: standard,
    appealsWithinWeek: appealTarget,
    appealsOverturned: overturned,
  };
}
