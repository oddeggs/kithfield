import type {
  CareFamily,
  Crop,
  FarmState,
  FieldGuidePage,
  PersonId,
  RareVariant,
} from '@kithfield/contracts';
import { aliasOf, sameSeason, type PlantEntry } from '@kithfield/farm';
import type { Language, Translate } from '@kithfield/i18n';

import { listOf, nameOf, say } from '../farm/farm-copy';
import { aroundBold, monthLong, monthOf, plantWord, variantOf, whose } from './guide-copy';
import { sleepyDays } from './guide-model';
import { otherOnPorch, wateredBy } from './porch-model';

/*
 * The sentences on a plant's page, a rare bloom, harvest day and the porch pot, from who tended
 * what. Credits name people and the kinds of care they gave; nothing is counted or ranked.
 */

export interface Sentence {
  readonly before: string;
  readonly bold: string;
  readonly after: string;
}

const plain = (text: string): Sentence => ({ before: text, bold: '', after: '' });

export interface CreditLine extends Sentence {
  /** Whose critters stand beside the line, at most three. */
  readonly people: readonly PersonId[];
}

/** Who grew a plant this season: the first to tend it by name and care, then up to two more. */
export function plantCredits(
  t: Translate,
  state: FarmState,
  entry: PlantEntry,
  found: boolean,
): CreditLine | null {
  if (entry.role === 'rose') return null;
  const growing = state.plants.find((p) => p.plant === entry.id);
  const credits = (growing?.credits ?? []).map((c) => ({ ...c, person: aliasOf(state, c.person) }));
  const [first, ...rest] = credits.filter(
    (c, i) => credits.findIndex((d) => d.person === c.person) === i,
  );
  if (first) {
    const lead = whose(t, state, first.person, first.kinds[0] ?? '');
    const others = rest
      .slice(0, 2)
      .map((c) => t('fieldGuide.page.credits.other', { name: nameOf(t, state, c.person) }));
    const sentence = aroundBold(
      (mark) =>
        others.length > 0
          ? t('fieldGuide.page.credits.more', { lead: mark, others: listOf(t, others) })
          : t('fieldGuide.page.credits.one', { lead: mark }),
      lead,
    );
    return { ...sentence, people: [first.person, ...rest.slice(0, 2).map((c) => c.person)] };
  }
  const kinds = entry.family ? say(t, `fieldGuide.family.${entry.family}.kinds`) : null;
  if (growing) {
    const text = kinds
      ? t('fieldGuide.page.credits.open', { kinds })
      : t('fieldGuide.page.credits.openAll');
    return { ...plain(text), people: [] };
  }
  if (found || !kinds || !entry.season) {
    return { ...plain(t('fieldGuide.page.credits.past')), people: [] };
  }
  const season = say(t, `fieldGuide.seasonWord.${entry.season}`);
  return { ...plain(t('fieldGuide.page.credits.later', { kinds, season })), people: [] };
}

/** How the plant naps and wakes, by its family's kinds of care; the rose's birthday line. */
export function sleepyLine(
  t: Translate,
  language: Language,
  state: FarmState,
  entry: PlantEntry,
): string {
  const days = sleepyDays(entry, state.season.season);
  if (days === null) return t('fieldGuide.page.rose');
  const plant = plantWord(t, language, state, entry.id);
  const family: CareFamily | 'signature' | 'pot' =
    entry.family ?? (entry.role === 'pot' ? 'pot' : 'signature');
  return say(t, `fieldGuide.page.sleepy.${family}`, { days, plant });
}

/**
 * The rare line: the variant the farm found for this plant, with when, or the one shared rain
 * can bring any season. Null for plants that never turn rare (the rose, the porch pot).
 */
export function rareLine(
  t: Translate,
  language: Language,
  state: FarmState,
  entry: PlantEntry,
): Sentence | null {
  if (!entry.canBeRare) return null;
  const page = state.fieldGuide.find((p) => p.plant === entry.id && p.variant !== null);
  const variant: RareVariant = page?.variant ?? 'rain_kissed';
  const rare = variantOf(t, language, state, variant, entry.id);
  return aroundBold(
    (mark) =>
      page
        ? t('fieldGuide.page.rare.found', {
            rare: mark,
            month: monthLong(t, monthOf(state, page.foundAt)),
          })
        : say(t, `fieldGuide.page.rare.${variant}`, { rare: mark }),
    rare,
  );
}

/** "found in June", from the page's first bloom. */
export const foundLine = (t: Translate, state: FarmState, page: FieldGuidePage): string =>
  t('fieldGuide.page.foundIn', { month: monthLong(t, monthOf(state, page.foundAt)) });

/**
 * Why a rare bloom opened. Rain-kissed on a shared-rain day names who was there, when the phone
 * holds that day's `shared_rain` (`people`); otherwise it says the weather.
 */
export function rareBody(
  t: Translate,
  state: FarmState,
  me: PersonId | null,
  plant: string,
  variant: RareVariant,
  people: readonly PersonId[] | null,
): string {
  const rolled = state.plants.find((p) => p.plant === plant)?.rareRolledOn ?? null;
  const shared = variant === 'rain_kissed' && rolled !== null && state.sharedRainDay === rolled;
  if (!shared) return say(t, `fieldGuide.rare.body.${variant}`);
  if (!people || people.length === 0) return t('fieldGuide.rare.sharedRain');
  const ids = [...new Set(people.map((p) => aliasOf(state, p)))];
  const ordered = me && ids.includes(me) ? [me, ...ids.filter((p) => p !== me)] : ids;
  const names = ordered.map((p) => (p === me ? t('fieldGuide.you') : nameOf(t, state, p)));
  return t('fieldGuide.rare.together', { names: listOf(t, names) });
}

/**
 * Harvest day's note: everyone's care is in the basket, naming up to two of the quieter friends
 * (those credited on the fewest of its plants) by the care they gave. Never ranked, never counted.
 */
export function harvestNote(
  t: Translate,
  state: FarmState,
  crops: readonly Crop[],
  me: PersonId | null,
): string {
  const basket = new Set(crops.map((c) => c.plant));
  const sameSeasonPlants =
    state.basket && sameSeason(state.basket.season, state.season) ? state.plants : [];
  const seen = new Map<PersonId, { kind: string; plants: number; order: number }>();
  sameSeasonPlants
    .filter((p) => basket.has(p.plant))
    .forEach((p) =>
      p.credits.forEach((c) => {
        const person = aliasOf(state, c.person);
        const had = seen.get(person);
        seen.set(person, {
          kind: had?.kind ?? c.kinds[0] ?? '',
          plants: (had?.plants ?? 0) + 1,
          order: had?.order ?? seen.size,
        });
      }),
    );
  const quiet = [...seen.entries()]
    .filter(([person]) => person !== me)
    .sort((a, b) => a[1].plants - b[1].plants || a[1].order - b[1].order)
    .slice(0, 2)
    .map(([person, c]) => whose(t, state, person, c.kind));
  return quiet.length > 0
    ? t('fieldGuide.harvest.note', { whose: listOf(t, quiet) })
    : t('fieldGuide.harvest.noteAll');
}

/** Who watered the porch pot this season: "Otis’s voice notes and your notes both watered it." */
export function potLine(t: Translate, state: FarmState, me: PersonId): string {
  const { mine, theirs } = wateredBy(state, me);
  const care = (kind: string) => {
    const word = say(t, `farm.care.${kind}`);
    return word === `farm.care.${kind}` ? t('farm.care.other') : word;
  };
  const yours = mine ? t('fieldGuide.pot.yours', { care: care(mine) }) : null;
  const other = theirs ? whose(t, state, theirs.person, theirs.kind) : null;
  if (yours && other) return t('fieldGuide.pot.both', { theirs: other, mine: yours });
  const one = other ?? yours;
  if (one)
    return t('fieldGuide.pot.one', { whose: one.charAt(0).toLocaleUpperCase() + one.slice(1) });
  return t('fieldGuide.pot.none');
}

/** "June and Otis": the two on the porch, you first. */
export function porchNames(t: Translate, state: FarmState, me: PersonId): string {
  const other = otherOnPorch(state, me);
  const names = [nameOf(t, state, me), ...(other ? [other.name ?? t('farm.someone')] : [])];
  return listOf(t, names);
}
