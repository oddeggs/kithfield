import { type FarmGate, type GateList, LIMITS, type PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { farmStub } from '../farm/http';

/*
 * The gates a person may walk up to: friends of friends. A farm (never a visit) where someone they
 * share a farm with lives now, which they don't live on themselves. The same rules as the gate:
 * D1's membership mirror finds the farms, blocks either way drop a friend (and a farm with no
 * friend left), and the farm itself refuses anyone it removed (its `gate` answers nothing).
 */

/** At most this many gates in a list. */
export const GATES_MAX = 200;
/** Farms asked for their gate at once. */
const BATCH = 20;
/** A bound on the rows read from D1, far above any real circle of friends. */
const ROWS_MAX = 5000;

type Row = { farm: string; friend: PersonId };

/** Farms (and the friends living there) the person may visit, by D1's mirror. */
const candidates = async (
  db: D1Database,
  person: PersonId,
  friend: PersonId | null,
): Promise<Map<string, PersonId[]>> => {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT t.farm_id AS farm, o.person_id AS friend
       FROM memberships v
       JOIN farms vf ON vf.id = v.farm_id AND vf.kind = 'farm'
       JOIN memberships o ON o.farm_id = v.farm_id AND o.person_id <> v.person_id AND o.left_at IS NULL
       JOIN memberships t ON t.person_id = o.person_id AND t.left_at IS NULL
       JOIN farms tf ON tf.id = t.farm_id AND tf.kind = 'farm'
       WHERE v.person_id = ?1 AND v.left_at IS NULL
         AND (?2 IS NULL OR o.person_id = ?2)
         AND NOT EXISTS (
           SELECT 1 FROM memberships mine
           WHERE mine.farm_id = t.farm_id AND mine.person_id = ?1 AND mine.left_at IS NULL)
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ?1 AND b.blocked_id = o.person_id)
              OR (b.blocker_id = o.person_id AND b.blocked_id = ?1))
       ORDER BY t.farm_id, o.person_id
       LIMIT ?3`,
    )
    .bind(person, friend, ROWS_MAX)
    .all<Row>();
  const farms = new Map<string, PersonId[]>();
  for (const row of results) {
    const friends = farms.get(row.farm) ?? [];
    if (friends.length < LIMITS.members) friends.push(row.friend);
    farms.set(row.farm, friends);
  }
  return farms;
};

/** The farm's gate as the person would see it; null when it won't let them in, or can't answer. */
const gateOf = async (env: Bindings, farm: string, person: PersonId): Promise<FarmGate | null> => {
  try {
    return await farmStub(env, farm).gate(person);
  } catch (error) {
    console.error('gate unavailable for the list', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
};

/** `GET /v1/gates[?person=]`: the farms this person may visit, or those of one friend. */
export const gateList = async (
  env: Bindings,
  person: PersonId,
  friend: PersonId | null,
): Promise<GateList> => {
  const farms = [...(await candidates(env.DB, person, friend))].slice(0, GATES_MAX);
  const gates: GateList['gates'] = [];
  for (let i = 0; i < farms.length; i += BATCH) {
    const batch = farms.slice(i, i + BATCH);
    const answers = await Promise.all(batch.map(([farm]) => gateOf(env, farm, person)));
    answers.forEach((gate, j) => {
      const friends = batch[j]?.[1] ?? [];
      if (gate === null || friends.length === 0) return;
      gates.push({
        farm: gate.farm,
        name: gate.name,
        land: gate.land,
        season: gate.season,
        signature: gate.signature,
        friends,
      });
    });
  }
  gates.sort((a, b) => a.name.localeCompare(b.name) || a.farm.localeCompare(b.farm));
  return { gates };
};
