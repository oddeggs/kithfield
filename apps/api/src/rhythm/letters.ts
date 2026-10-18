import type { FarmId, Lang, LocalDate, PersonId, WeeklyRecap } from '@kithfield/contracts';

import type { Bindings } from '../env';

/*
 * The Sunday recap's letter, written with an AI from the words of friends who said yes to the
 * `recap` consent, in the reader's language. The AI work fills this port in (it replaces
 * `recapLetters.current`); until a letter exists the recap answers `writing` when anyone on the
 * farm said yes, and `none` when nobody did. Either way the app then writes the letter itself from
 * the thanks and plans, with no AI.
 */

export type RecapLetterRequest = {
  farm: FarmId;
  /** The week's Sunday (farm day). */
  week: LocalDate;
  /** The reader's language. */
  lang: Lang;
  /** Who lives on the farm now: whose consent is read. */
  members: readonly PersonId[];
};

export type RecapLetter = Pick<WeeklyRecap, 'letterState' | 'letter'>;

export interface RecapLetters {
  letter(env: Bindings, request: RecapLetterRequest): Promise<RecapLetter>;
}

/** Whether anyone among `members` said yes to the recap. */
export const anyoneSaidYes = async (
  db: D1Database,
  members: readonly PersonId[],
): Promise<boolean> => {
  if (members.length === 0) return false;
  const marks = members.map(() => '?').join(', ');
  const row = await db
    .prepare(
      `SELECT 1 FROM consents WHERE feature = 'recap' AND allowed = 1 AND person_id IN (${marks}) LIMIT 1`,
    )
    .bind(...members)
    .first();
  return row !== null;
};

/** No letters are written yet: `writing` once someone said yes, else `none`. */
export const unwrittenLetters: RecapLetters = {
  async letter(env, request) {
    const yes = await anyoneSaidYes(env.DB, request.members);
    return { letterState: yes ? 'writing' : 'none', letter: null };
  },
};

/** The letters the recap reads; the AI work replaces `current` with its own. */
export const recapLetters: { current: RecapLetters } = { current: unwrittenLetters };
