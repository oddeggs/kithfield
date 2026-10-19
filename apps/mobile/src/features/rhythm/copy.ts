import type { RejectReason } from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';

import { listOf } from '../farm/farm-copy';

type LooseTranslate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

/** A key chosen at run time (a reason, a weather, a step of progress), with its parameters. */
export const say = (
  t: Translate,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string => (t as unknown as LooseTranslate)(key, params);

/** Who is under the shared rain: the friends there, with you last when you're there too. */
export const rainNames = (t: Translate, others: readonly string[], withMe: boolean): string =>
  listOf(t, withMe ? [...others, t('rhythm.you')] : [...others]);

/** A farm's name inside a sentence: "on the Thursday Lot", not "on The Thursday Lot". */
export const inSentence = (name: string, language: string): string =>
  language === 'en' ? name.replace(/^The /, 'the ') : name;

/**
 * Words in the hand-lettered faces: the curly apostrophe stands apart from its letters in Gaegu,
 * so these take the straight one the design writes.
 */
export const handText = (text: string): string => text.replace(/’/g, "'");

/**
 * What to say when the farm refuses a write (a dewdrop, a signature, a wave, a pressed page): the
 * same gentle words the gestures use for each reason, so a refusal is never silent.
 */
export const refusalCopy = (t: Translate, reason: RejectReason): string =>
  say(t, `gestures.reject.${reason}`);
