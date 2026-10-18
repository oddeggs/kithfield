import { Lang, type PersonId, type WeeklyRecap } from '@kithfield/contracts';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { recapLetters } from './letters';
import { pollinatorFor } from './pollinator';
import type { RecapFacts } from './recap-facts';

/*
 * The Sunday recap as served: the week's facts from the farm object, the best pollinator (chosen
 * and remembered here), and the letter in the reader's language. Thanks name people and kinds of
 * care, never totals.
 */

/** The reader's language: their own setting, else what their device asks for, else English. */
export const readerLang = async (
  env: Bindings,
  person: PersonId,
  acceptLanguage: string | undefined,
): Promise<Lang> => {
  try {
    const { settings } = await cottageOf(env, person).settings();
    return settings.lang;
  } catch {
    const first = acceptLanguage?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
    const asked = Lang.safeParse(first);
    return asked.success ? asked.data : 'en';
  }
};

export const weeklyRecap = async (
  env: Bindings,
  farm: string,
  lang: Lang,
  facts: RecapFacts,
  now: number,
): Promise<WeeklyRecap> => {
  const pollinator = await pollinatorFor(env.DB, farm, facts.week, facts.qualities, now);
  const letter = await recapLetters.current.letter(env, {
    farm,
    week: facts.week,
    lang,
    members: facts.members,
  });
  return {
    farm,
    week: facts.week,
    pollinator,
    thanks: facts.thanks,
    plans: facts.plans,
    letterState: letter.letterState,
    letter: letter.letter,
  };
};
