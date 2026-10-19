import type {
  CareFamily,
  Crop,
  EpochMs,
  FarmState,
  Hemisphere,
  RareVariant,
  Season,
} from '@kithfield/contracts';
import { SEASON_START_MONTH, SIGNATURE_POOL } from '@kithfield/farm';
import type { Language, Translate } from '@kithfield/i18n';

import { listOf, nameOf, say } from '../farm/farm-copy';
import { dayIn } from './guide-model';

/*
 * The field guide's words worked out from the farm: plant names as titles and mid-sentence, the
 * signature crop named after the farm, months and season ranges by hemisphere. Names and kinds of
 * care, never totals.
 */

export const capital = (s: string): string => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** A plant's name as the catalogues give it ("lavender", "Christmas rose", "Oải hương"). */
function rawName(t: Translate, plant: string): string {
  const farmKey = `farm.plant.${plant}`;
  const own = say(t, farmKey);
  return own === farmKey ? say(t, `fieldGuide.plant.${plant}`) : own;
}

/** The fruit a signature crop is drawn as, or null for any other plant. */
const fruitOf = (plant: string) => SIGNATURE_POOL.find((s) => s.plant === plant)?.id ?? null;

/**
 * The word a farm's name lends its signature crop: "The Thursday Lot" grows the Thursday plum.
 * In English a leading "The" and the last word go, as the design names it; other languages use
 * the farm's whole name.
 */
export function farmWord(language: Language, farm: string): string {
  if (language !== 'en') return farm;
  const words = farm.trim().split(/\s+/);
  const rest = words[0]?.toLowerCase() === 'the' ? words.slice(1) : words;
  return (rest.length > 1 ? rest.slice(0, -1) : rest).join(' ') || farm;
}

/** The signature crop's name, "Thursday plum" (or "Thursday plums" as a crop). */
export function signatureName(
  t: Translate,
  language: Language,
  farm: string | null,
  plant: string,
  crop = false,
): string {
  const fruit = fruitOf(plant) ?? plant;
  if (!farm) return capital(rawName(t, plant));
  const word = farmWord(language, farm);
  return capital(
    crop
      ? say(t, 'fieldGuide.signature.crop', {
          farm: word,
          fruits: say(t, `fieldGuide.fruits.${fruit}`),
        })
      : say(t, 'fieldGuide.signature.name', {
          farm: word,
          fruit: say(t, `fieldGuide.fruit.${fruit}`),
        }),
  );
}

/** A plant as a title ("Marigold"), the signature crop named after its farm. */
export function plantTitle(
  t: Translate,
  language: Language,
  state: Pick<FarmState, 'name' | 'signature'> | null,
  plant: string,
): string {
  if (fruitOf(plant) && state) return signatureName(t, language, state.name, plant);
  return capital(rawName(t, plant));
}

/** A plant mid-sentence: "the lavender", "oải hương" (Vietnamese common nouns are lower case). */
export function plantWord(
  t: Translate,
  language: Language,
  state: Pick<FarmState, 'name' | 'signature'> | null,
  plant: string,
): string {
  const title = plantTitle(t, language, state, plant);
  if (language === 'vi') return title.charAt(0).toLocaleLowerCase() + title.slice(1);
  return fruitOf(plant) && state?.name ? title : rawName(t, plant);
}

/** A crop in the basket: "Pumpkins", "Heather", "Thursday plums". */
export function cropName(
  t: Translate,
  language: Language,
  state: Pick<FarmState, 'name' | 'signature'>,
  crop: Crop,
): string {
  if (fruitOf(crop.plant)) return signatureName(t, language, state.name, crop.plant, true);
  const key = `fieldGuide.crop.${crop.plant}`;
  const own = say(t, key);
  return own === key ? capital(rawName(t, crop.plant)) : own;
}

/** "Dew", "Voices". */
export const familyName = (t: Translate, family: CareFamily): string =>
  say(t, `fieldGuide.family.${family}`);

/** A row's family line: "Voices · voice notes". */
export const familyLine = (t: Translate, family: CareFamily): string =>
  t('fieldGuide.familyLine', {
    family: familyName(t, family),
    kinds: say(t, `fieldGuide.family.${family}.short`),
  });

/** "rain-kissed lavender". */
export const variantOf = (
  t: Translate,
  language: Language,
  state: Pick<FarmState, 'name' | 'signature'> | null,
  variant: RareVariant,
  plant: string,
): string =>
  say(t, `fieldGuide.variant.${variant}`, { plant: plantWord(t, language, state, plant) });

export const monthShort = (t: Translate, month: number): string =>
  say(t, `fieldGuide.month.${month}`);

export const monthLong = (t: Translate, month: number): string =>
  say(t, `fieldGuide.monthLong.${month}`);

/** The month (1–12) an instant fell in, on the farm's calendar. */
export const monthOf = (state: Pick<FarmState, 'timeZone'>, at: EpochMs): number =>
  Number(dayIn(state, at).slice(5, 7));

/** "31 May": a day of the farm's calendar. */
export function dateOf(t: Translate, state: Pick<FarmState, 'timeZone'>, at: EpochMs): string {
  const day = dayIn(state, at);
  return t('fieldGuide.date', {
    day: String(Number(day.slice(8, 10))),
    month: monthShort(t, Number(day.slice(5, 7))),
  });
}

/** A season's months by hemisphere: "Sep–Nov". */
export function monthsOf(t: Translate, season: Season, hemisphere: Hemisphere): string {
  const from = SEASON_START_MONTH[hemisphere][season];
  const to = ((from + 1) % 12) + 1;
  return t('fieldGuide.months', { from: monthShort(t, from), to: monthShort(t, to) });
}

/** "Autumn · Sep–Nov", with "· now" for the farm's current season. */
export function seasonRange(
  t: Translate,
  season: Season,
  hemisphere: Hemisphere,
  now: boolean,
): string {
  const from = SEASON_START_MONTH[hemisphere][season];
  const to = ((from + 1) % 12) + 1;
  return t(now ? 'fieldGuide.rangeNow' : 'fieldGuide.range', {
    season: say(t, `fieldGuide.season.${season}`),
    from: monthShort(t, from),
    to: monthShort(t, to),
  });
}

/** A marker no copy contains, to split a sentence around a bold phrase. */
const MARK = '⁣';

/**
 * A sentence around a bold phrase, as its catalogue words it: `{rare}` or `{lead}` stands where
 * the bold goes, so each language keeps its own word order.
 */
export function aroundBold(
  build: (mark: string) => string,
  bold: string,
): { readonly before: string; readonly bold: string; readonly after: string } {
  const [before = '', after = ''] = build(MARK).split(MARK);
  return { before, bold, after };
}

/** "Bea’s voice notes": a person and the first kind of care they gave. */
export const whose = (t: Translate, state: FarmState, person: string, kind: string): string => {
  const care = say(t, `farm.care.${kind}`);
  return t('farm.credits.whose', {
    name: nameOf(t, state, person),
    care: care === `farm.care.${kind}` ? t('farm.care.other') : care,
  });
};

export { listOf };
