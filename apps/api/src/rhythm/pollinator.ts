import type { LocalDate, PersonId } from '@kithfield/contracts';
import { addDays, hashUnit } from '@kithfield/farm';

import { registerAccountDeletionStep, registerMergeStep } from '../auth';
import type { RecapFacts } from './recap-facts';

/*
 * The week's best pollinator: someone who showed one of the recap's qualities (checked on
 * everyone, planned a hangout, came back, shared pictures, sat by the fire, kept the farm warm),
 * never whoever did the most. It rotates: last week's pollinator isn't chosen again while anyone
 * else qualifies. Among those who qualify the pick is a hash of the farm and the week, so it is
 * the same on every read, and it is remembered in D1 once made.
 */

export type Pollinator = { person: PersonId; reason: string };

type Row = { person_id: PersonId; reason: string };

const remembered = (db: D1Database, farm: string, week: LocalDate): Promise<Row | null> =>
  db
    .prepare('SELECT person_id, reason FROM recap_pollinators WHERE farm_id = ? AND week = ?')
    .bind(farm, week)
    .first<Row>();

/** The pick among those who qualify, before it is remembered. */
export const pickPollinator = (
  farm: string,
  week: LocalDate,
  qualities: RecapFacts['qualities'],
  last: PersonId | null,
): Pollinator | null => {
  const qualified = qualities.filter((q) => q.reasons.length > 0);
  const others = qualified.filter((q) => q.person !== last);
  const pool = (others.length > 0 ? others : qualified).toSorted((a, b) =>
    a.person.localeCompare(b.person),
  );
  const chosen = pool[Math.floor(hashUnit('pollinator', farm, week) * pool.length)];
  const reason = chosen?.reasons[0];
  return chosen === undefined || reason === undefined ? null : { person: chosen.person, reason };
};

/** The week's pollinator: remembered, or picked now and remembered; null when nobody tended. */
export const pollinatorFor = async (
  db: D1Database,
  farm: string,
  week: LocalDate,
  qualities: RecapFacts['qualities'],
  now: number,
): Promise<Pollinator | null> => {
  const kept = await remembered(db, farm, week);
  if (kept !== null) return { person: kept.person_id, reason: kept.reason };
  const last = await remembered(db, farm, addDays(week, -7));
  const pick = pickPollinator(farm, week, qualities, last?.person_id ?? null);
  if (pick === null) return null;
  await db
    .prepare(
      `INSERT OR IGNORE INTO recap_pollinators (farm_id, week, person_id, reason, chosen_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(farm, week, pick.person, pick.reason, now)
    .run();
  // Two first reads at once keep whichever was written first.
  const settled = await remembered(db, farm, week);
  return settled === null ? pick : { person: settled.person_id, reason: settled.reason };
};

/** A deleted account's weeks as pollinator go with it. */
registerAccountDeletionStep('recap-pollinators', async (env, person) => {
  await env.DB.prepare('DELETE FROM recap_pollinators WHERE person_id = ?').bind(person).run();
});

/** A merged-away person's weeks as pollinator become the returning person's. */
registerMergeStep('recap-pollinators', (db, { from, into }) => [
  db.prepare('UPDATE recap_pollinators SET person_id = ? WHERE person_id = ?').bind(into, from),
]);
