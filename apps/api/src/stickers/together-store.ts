import type { TogetherAskList } from '@kithfield/contracts';

import { registerAccountDeletionStep, registerMergeStep } from '../auth';
import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';

/*
 * Together stickers in D1: who on a farm a person may draw into one, and the asks to take one out
 * of Kithfield (`together_consents`). A no is stored, but every answer to the asker reads it the
 * same as no answer yet.
 */

/**
 * The farm's members the asker may draw into a together sticker: living there now, account not
 * deleted, not the asker, no block either way, and in together stickers (their cottage's
 * `inTogetherStickers`). In the order they joined.
 */
export async function drawablePeople(
  env: Bindings,
  farm: string,
  asker: string,
): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.person_id FROM memberships m JOIN people p ON p.id = m.person_id
     WHERE m.farm_id = ?1 AND m.left_at IS NULL AND m.person_id <> ?2 AND p.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = ?2 AND b.blocked_id = m.person_id)
            OR (b.blocker_id = m.person_id AND b.blocked_id = ?2)
       )
     ORDER BY m.joined_at, m.person_id`,
  )
    .bind(farm, asker)
    .all<{ person_id: string }>();
  const people = results.map((r) => r.person_id);
  const inStickers = await Promise.all(
    people.map(async (person) => (await cottageOf(env, person).settings()).settings),
  );
  return people.filter((_, i) => inStickers[i]?.inTogetherStickers === true);
}

/**
 * Records an ask of each subject by the asker, once: asking again keeps the first ask and its
 * answer. Answers the subjects who said yes to this asker.
 */
export async function askToExport(
  db: D1Database,
  ask: { asker: string; farm: string; people: readonly string[]; at: number },
): Promise<string[]> {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO together_consents (subject_id, asker_id, farm_id, ok, asked_at)
     VALUES (?, ?, ?, NULL, ?)`,
  );
  await db.batch(ask.people.map((p) => insert.bind(p, ask.asker, ask.farm, ask.at)));
  const marks = ask.people.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT subject_id FROM together_consents
       WHERE asker_id = ? AND ok = 1 AND subject_id IN (${marks})`,
    )
    .bind(ask.asker, ...ask.people)
    .all<{ subject_id: string }>();
  const yes = new Set(results.map((r) => r.subject_id));
  return ask.people.filter((p) => yes.has(p));
}

type AskRow = { asker_id: string; farm_id: string; asked_at: number; ok: number | null };

/**
 * The asks waiting on or answered by the subject, newest first, leaving out askers whose account
 * was deleted and anyone either of them blocked.
 */
export async function asksOf(db: D1Database, subject: string): Promise<TogetherAskList> {
  const { results } = await db
    .prepare(
      `SELECT t.asker_id, t.farm_id, t.asked_at, t.ok
       FROM together_consents t JOIN people p ON p.id = t.asker_id
       WHERE t.subject_id = ?1 AND p.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ?1 AND b.blocked_id = t.asker_id)
              OR (b.blocker_id = t.asker_id AND b.blocked_id = ?1)
         )
       ORDER BY t.asked_at DESC, t.asker_id LIMIT 500`,
    )
    .bind(subject)
    .all<AskRow>();
  return {
    asks: results.map((r) => ({
      from: r.asker_id,
      farm: r.farm_id,
      at: r.asked_at,
      ok: r.ok === null ? null : r.ok === 1,
    })),
  };
}

/** The subject's answer to one asker, given or changed; false when that person never asked. */
export async function answerAsk(
  db: D1Database,
  answer: { subject: string; asker: string; ok: boolean; at: number },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE together_consents SET ok = ?, answered_at = ?
       WHERE subject_id = ? AND asker_id = ?`,
    )
    .bind(answer.ok ? 1 : 0, answer.at, answer.subject, answer.asker)
    .run();
  return result.meta.changes > 0;
}

// A deleted account's asks go, both those it made and those made of it.
registerAccountDeletionStep('together-stickers', async (env, person) => {
  await env.DB.prepare('DELETE FROM together_consents WHERE subject_id = ?1 OR asker_id = ?1')
    .bind(person)
    .run();
});

// The returning person keeps the anonymous one's asks and answers, unless they already have one
// with the same person; nobody is ever asked about themselves.
registerMergeStep('together-stickers', (db, { from, into }) => [
  db
    .prepare(
      `INSERT OR IGNORE INTO together_consents
         (subject_id, asker_id, farm_id, ok, asked_at, answered_at)
       SELECT ?2, asker_id, farm_id, ok, asked_at, answered_at FROM together_consents
       WHERE subject_id = ?1 AND asker_id <> ?2`,
    )
    .bind(from, into),
  db
    .prepare(
      `INSERT OR IGNORE INTO together_consents
         (subject_id, asker_id, farm_id, ok, asked_at, answered_at)
       SELECT subject_id, ?2, farm_id, ok, asked_at, answered_at FROM together_consents
       WHERE asker_id = ?1 AND subject_id <> ?2`,
    )
    .bind(from, into),
  db.prepare('DELETE FROM together_consents WHERE subject_id = ?1 OR asker_id = ?1').bind(from),
]);
