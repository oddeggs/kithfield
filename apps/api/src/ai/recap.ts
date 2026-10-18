import type { FarmId, Lang, RecapJob, WeeklyRecap } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { consentingMembers, hasConsent } from './consent';
import { eventsBetween, farmState } from './farm-reads';
import { weekFacts, writeLetter } from './letter';
import type { AiBinding } from './models';
import { dropLetters, getJson, type Letter, letterKey, letterRows, putJson } from './store';

/*
 * The Sunday recap letter. A `RecapJob` writes the week's letter in each language the farm's
 * members read, from the words of members who said yes to `recap`, read again when the job runs.
 * The rhythm feature serves `WeeklyRecap` and asks `getAiRecap` for the letter; while the letter
 * is being written, or when there is none, the app writes its own from the thanks and plans.
 */

const DAY_MS = 86_400_000;

/** The Monday that starts the week ending on `week` (a Sunday). */
export const weekStart = (week: string): string =>
  new Date(Date.parse(`${week}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);

/** A letter still `writing` after this long has stalled; the app writes its own. */
const WRITING_STALE_MS = 12 * 60 * 60_000;

/** The AI letter's part of a `WeeklyRecap`. */
export type AiRecap = Pick<WeeklyRecap, 'letterState' | 'letter'>;

/**
 * The AI-written letter for a farm's week, for the rhythm feature's `WeeklyRecap`: in `lang` when
 * given (the asker's language), otherwise in whichever language it was written. `none` when no
 * letter was asked for, it couldn't be written, or it was deleted since.
 */
export async function getAiRecap(
  env: Bindings,
  farm: FarmId,
  week: string,
  lang?: Lang,
): Promise<AiRecap> {
  const rows = await letterRows(env.DB, farm, week);
  const row =
    lang === undefined
      ? (rows.find((r) => r.state === 'written') ?? rows[0])
      : rows.find((r) => r.lang === lang);
  const none: AiRecap = { letterState: 'none', letter: null };
  if (row === undefined) return none;
  if (row.state === 'writing') {
    return Date.now() - row.updated_at < WRITING_STALE_MS
      ? { letterState: 'writing', letter: null }
      : none;
  }
  if (row.state !== 'written') return none;
  const letter = await getJson<Letter>(env, letterKey(farm, week, row.lang));
  return letter === null ? none : { letterState: 'written', letter };
}

/** Marks the week's letters as being written, as the job is queued. */
export async function letterQueued(
  db: D1Database,
  farm: FarmId,
  week: string,
  langs: readonly Lang[],
  now: number,
): Promise<void> {
  await db.batch(
    langs.map((lang) =>
      db
        .prepare(
          `INSERT INTO recap_letters (farm_id, week, lang, state, updated_at) VALUES (?, ?, ?, 'writing', ?)
           ON CONFLICT (farm_id, week, lang) DO UPDATE SET state = 'writing', updated_at = excluded.updated_at
           WHERE recap_letters.state != 'written'`,
        )
        .bind(farm, week, lang, now),
    ),
  );
}

const setLetterState = (
  db: D1Database,
  farm: FarmId,
  week: string,
  lang: Lang,
  state: 'written' | 'failed',
) =>
  db
    .prepare(
      `INSERT INTO recap_letters (farm_id, week, lang, state, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (farm_id, week, lang) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
    )
    .bind(farm, week, lang, state, Date.now())
    .run();

/** Thrown when every try at a letter broke a house rule, so the queue tries again later. */
export class LetterRefused extends Error {
  constructor() {
    super('the letter broke a house rule on every try');
  }
}

/**
 * Runs a recap job. Safe to run again: letters already written are left alone. With nobody saying
 * yes now, or nothing they did this week, no letter is written and the app writes its own.
 */
export async function runRecap(env: Bindings, ai: AiBinding, job: RecapJob): Promise<void> {
  const { farm, week } = job;
  const rows = await letterRows(env.DB, farm, week);
  const todo = job.langs.filter((l) => rows.find((r) => r.lang === l)?.state !== 'written');
  if (todo.length === 0) return;
  const consenting = await consentingMembers(env.DB, farm, 'recap');
  const state = consenting.length === 0 ? null : await farmState(env, farm);
  const reader = consenting[0];
  const events =
    state === null || reader === undefined
      ? null
      : await eventsBetween(env, farm, reader, weekStart(week), week);
  const names = new Map<string, string>();
  for (const m of state?.members ?? []) if (m.name !== null) names.set(m.person, m.name);
  const facts =
    events === null || state === null
      ? null
      : weekFacts(events, consenting, names, state.name ?? '');
  if (facts === null || facts.people.length === 0) {
    await dropLetters(env, farm, week);
    return;
  }
  // Whose words go in is recorded first, so a withdrawal meanwhile finds this letter.
  await env.DB.batch(
    facts.people.map((p) =>
      env.DB.prepare(
        'INSERT OR IGNORE INTO recap_sources (farm_id, week, person_id) VALUES (?, ?, ?)',
      ).bind(farm, week, p.person),
    ),
  );
  for (const lang of todo) {
    const letter = await writeLetter(ai, facts, lang);
    if (letter === null) throw new LetterRefused();
    await putJson(env, letterKey(farm, week, lang), letter);
    await setLetterState(env.DB, farm, week, lang, 'written');
  }
  // Someone who said no while it was being written is never in a letter.
  for (const p of facts.people) {
    if (!(await hasConsent(env.DB, p.person, 'recap'))) {
      await dropLetters(env, farm, week);
      return;
    }
  }
}

/** A recap job that ran out of tries: the app writes its own letter. */
export async function recapGaveUp(env: Bindings, job: RecapJob): Promise<void> {
  for (const lang of job.langs) {
    const row = (await letterRows(env.DB, job.farm, job.week)).find((r) => r.lang === lang);
    if (row?.state === 'writing') await setLetterState(env.DB, job.farm, job.week, lang, 'failed');
  }
}
