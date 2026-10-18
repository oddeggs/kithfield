import type { PersonMergedJob } from '@kithfield/contracts';

import { type PersonMerge, registerMergeStep } from '../auth';
import { registerPersonMergedStep } from '../deletion';
import type { Bindings } from '../env';
import { farmStub } from './http';

/*
 * An anonymous person signing in to a returning account merges into it. In the merge's own D1
 * batch the farm tables move to the kept person; afterwards the `person_merged` job asks each of
 * those farms to move the person's state, and to read the old id as the kept one from then on.
 */

/** The farms' D1 rows, as statements for the merge's one batch. */
/** A role's rank in SQL: the kept person keeps the higher of two. */
const rank = (column: string) =>
  `(CASE ${column} WHEN 'keeper' THEN 2 WHEN 'helper' THEN 1 ELSE 0 END)`;

export const farmMergeStatements = (db: D1Database, { from, into, now }: PersonMerge) => {
  // A visit's pair is its two people sorted and joined with ':'; ?1 is replaced by ?2 in it.
  const startsWith = `substr(pair, 1, length(?1) + 1) = ?1 || ':'`;
  const endsWith = `substr(pair, -length(?1) - 1) = ':' || ?1`;
  const other = `(CASE WHEN ${startsWith} THEN substr(pair, length(?1) + 2) ELSE substr(pair, 1, length(pair) - length(?1) - 1) END)`;
  const newPair = `CASE WHEN ?2 < ${other} THEN ?2 || ':' || ${other} ELSE ${other} || ':' || ?2 END`;
  return [
    db
      .prepare(
        'INSERT OR IGNORE INTO farm_merges (from_person, into_person, farm_id, at) SELECT ?, ?, farm_id, ? FROM memberships WHERE person_id = ?',
      )
      .bind(from, into, now, from),
    db
      .prepare(
        `INSERT INTO memberships (person_id, farm_id, role, joined_at, left_at, muted_until, knock_for)
         SELECT ?, farm_id, role, joined_at, left_at, muted_until, knock_for FROM memberships WHERE person_id = ?
         ON CONFLICT (person_id, farm_id) DO UPDATE SET role = CASE
           WHEN ${rank('excluded.role')} > ${rank('memberships.role')} THEN excluded.role
           ELSE memberships.role END,
         left_at = CASE
           WHEN memberships.left_at IS NULL OR excluded.left_at IS NULL THEN NULL
           ELSE max(memberships.left_at, excluded.left_at) END`,
      )
      .bind(into, from),
    db.prepare('DELETE FROM memberships WHERE person_id = ?').bind(from),
    db
      .prepare(
        `INSERT OR IGNORE INTO farm_waiting (farm_id, person_id, name, critter, asked_at)
         SELECT farm_id, ?, name, critter, asked_at FROM farm_waiting WHERE person_id = ?`,
      )
      .bind(into, from),
    db.prepare('DELETE FROM farm_waiting WHERE person_id = ?').bind(from),
    db.prepare('UPDATE farms SET keeper_id = ? WHERE keeper_id = ?').bind(into, from),
    db
      .prepare(
        `UPDATE OR IGNORE farms SET pair = ${newPair} WHERE kind = 'visit' AND (${startsWith} OR ${endsWith})`,
      )
      .bind(from, into),
  ];
};

/** The farms' part of a `person_merged` job: safe to run again. */
export const moveFarmState = async (env: Bindings, job: PersonMergedJob): Promise<void> => {
  const { results } = await env.DB.prepare(
    'SELECT farm_id FROM farm_merges WHERE from_person = ? AND into_person = ?',
  )
    .bind(job.from, job.into)
    .all<{ farm_id: string }>();
  for (const { farm_id } of results) await farmStub(env, farm_id).mergePerson(job.from, job.into);
  await env.DB.prepare('DELETE FROM farm_merges WHERE from_person = ? AND into_person = ?')
    .bind(job.from, job.into)
    .run();
};

registerMergeStep('farms', farmMergeStatements);
registerPersonMergedStep('farms', moveFarmState);
