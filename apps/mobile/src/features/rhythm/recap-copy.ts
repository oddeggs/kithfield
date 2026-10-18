import { KNOWN_POLLINATOR_REASONS, type PersonId, type WeeklyRecap } from '@kithfield/contracts';
import type { StringKey, Translate } from '@kithfield/i18n';

import { careNoun, listOf } from '../farm/farm-copy';
import { say } from './copy';

/** Kinds of care that are easy to miss: the quiet friends the letter makes sure to thank. */
const QUIET = [
  'dewdrop',
  'firefly',
  'quiet_note',
  'wave',
  'hug',
  'knock',
  'slow_post',
  'vote',
  'rsvp',
  'gift',
  'sticker',
];

const PICTURES = new Set(['media', 'sticker']);
const VOICES = new Set(['voice', 'fire']);
const WORDS = new Set(['message', 'link', 'quiet_note', 'slow_post']);

export interface RecapCopy {
  readonly title: string;
  readonly body: string;
  /** Written with an AI from friends who said yes, or put together here from what people did. */
  readonly byAi: boolean;
  readonly pollinator: { readonly person: PersonId; readonly reason: string } | null;
  /** Thanks to quiet friends besides the pollinator, and who they are. */
  readonly thanks: { readonly line: string; readonly people: readonly PersonId[] } | null;
}

const capitalise = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

/** The reason's words; a reason this app doesn't know reads plainly. */
export function reasonKey(reason: string): StringKey {
  return (KNOWN_POLLINATOR_REASONS as readonly string[]).includes(reason)
    ? (`rhythm.recap.reason.${reason}` as StringKey)
    : 'rhythm.recap.reason.other';
}

/** The quietest kind someone gave, so the thanks names what might go unnoticed. */
const quietestKind = (kinds: readonly string[]): string | null =>
  QUIET.find((k) => kinds.includes(k)) ?? kinds[0] ?? null;

/**
 * The letter the app writes itself, from the kinds of care and the plans of the week, never from
 * anyone's words and never with a number.
 */
function localBody(t: Translate, recap: WeeklyRecap, nameOf: (p: PersonId) => string): string {
  const kinds = new Set(recap.thanks.flatMap((c) => c.kinds));
  if (recap.thanks.length === 0) return t('rhythm.recap.restful');
  const parts: string[] = [];
  if (recap.plans.length > 0) parts.push(t('rhythm.recap.bodyPlans'));
  if ([...kinds].some((k) => PICTURES.has(k))) parts.push(t('rhythm.recap.bodyPictures'));
  if ([...kinds].some((k) => VOICES.has(k))) parts.push(t('rhythm.recap.bodyVoices'));
  else if ([...kinds].some((k) => WORDS.has(k))) parts.push(t('rhythm.recap.bodyWords'));
  if (recap.pollinator?.reason === 'came_back') {
    parts.push(t('rhythm.recap.bodyCameBack', { name: nameOf(recap.pollinator.person) }));
  }
  if (parts.length === 0) parts.push(t('rhythm.recap.bodyQuiet'));
  return capitalise(t('rhythm.recap.sentence', { list: listOf(t, parts.slice(0, 3)) }));
}

/** What the Sunday harvest card says. */
export function recapCopy(
  t: Translate,
  recap: WeeklyRecap,
  farmName: string,
  nameOf: (person: PersonId) => string,
): RecapCopy {
  const letter = recap.letterState === 'written' ? recap.letter : null;
  const pollinator = recap.pollinator && {
    person: recap.pollinator.person,
    reason: say(t, reasonKey(recap.pollinator.reason)),
  };
  const others = recap.thanks
    .filter((c) => c.person !== recap.pollinator?.person && c.kinds.length > 0)
    .map((c) => ({ person: c.person, kind: quietestKind(c.kinds) }))
    // Quiet kinds first; otherwise in the order the farm thanks them.
    .sort((a, b) => Number(!QUIET.includes(a.kind ?? '')) - Number(!QUIET.includes(b.kind ?? '')))
    .slice(0, 2);
  const thanks =
    others.length === 0
      ? null
      : {
          people: others.map((o) => o.person),
          line: t('rhythm.recap.thanks', {
            whose: listOf(
              t,
              others.map((o) =>
                t('rhythm.recap.whose', {
                  name: nameOf(o.person),
                  care: careNoun(t, o.kind ?? 'other'),
                }),
              ),
            ),
          }),
        };
  return {
    title: letter ? letter.title : t('rhythm.recap.title', { farm: farmName }),
    body: letter ? letter.body : localBody(t, recap, nameOf),
    byAi: letter !== null,
    pollinator,
    thanks,
  };
}
