import type {
  Crop,
  EpochMs,
  FarmState,
  PersonId,
  RareVariant,
  SeasonRef,
} from '@kithfield/contracts';
import { addDays, sameSeason, seasonDays, seasonOf, startOfDay } from '@kithfield/farm';

/*
 * The two full-screen moments of the field guide, each shown once to each member on this phone:
 * a rare bloom, the next time they open the farm, and harvest day's basket. What was seen is
 * kept as a small flag on the phone.
 */

export interface RareBloom {
  readonly plant: string;
  readonly variant: RareVariant;
  readonly season: SeasonRef;
  readonly foundAt: EpochMs;
  /** Names this bloom in the phone's "seen" flag and the moment's route. */
  readonly key: string;
}

export const seasonKey = (s: SeasonRef): string => `${s.year}-${s.season}`;

export const rareKey = (p: {
  readonly plant: string;
  readonly variant: RareVariant;
  readonly season: SeasonRef;
}): string => `${seasonKey(p.season)}-${p.plant}-${p.variant}`;

/** The rare blooms this farm grew this season, newest first. Traded pages come with a swap. */
export function rareBlooms(state: FarmState): RareBloom[] {
  if (state.kind !== 'farm') return [];
  return state.fieldGuide
    .flatMap((p) =>
      p.variant !== null && p.via === 'grown' && sameSeason(p.season, state.season)
        ? [{ plant: p.plant, variant: p.variant, season: p.season, foundAt: p.foundAt }]
        : [],
    )
    .map((b) => ({ ...b, key: rareKey(b) }))
    .sort((a, b) => b.foundAt - a.foundAt);
}

/** A rare bloom by its key, while its page is in the guide. */
export const rareBloomByKey = (state: FarmState, key: string): RareBloom | null =>
  rareBlooms(state).find((b) => b.key === key) ?? null;

/**
 * The rare bloom to show `me` as the farm opens: the newest of this season's that this phone
 * hasn't shown them, and only to a member who was here when it bloomed.
 */
export function rareBloomToShow(
  state: FarmState,
  me: PersonId,
  seen: readonly string[],
): RareBloom | null {
  const self = state.members.find((m) => m.person === me);
  if (!self) return null;
  return rareBlooms(state).find((b) => self.joinedAt <= b.foundAt && !seen.includes(b.key)) ?? null;
}

/** The "seen" list after showing `key`: only this season's keys are kept, so it never grows. */
export function seenWith(state: FarmState, seen: readonly string[], key: string): string[] {
  const current = new Set(rareBlooms(state).map((b) => b.key));
  return [...new Set([...seen.filter((k) => current.has(k)), key])];
}

/** The phone's flag value as a list of keys; anything unreadable is an empty list. */
export function parseSeen(value: string | null): string[] {
  if (!value) return [];
  try {
    const list: unknown = JSON.parse(value);
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export interface Harvest {
  readonly season: SeasonRef;
  readonly crops: readonly Crop[];
  /** Names this harvest in the phone's "seen" flag. */
  readonly key: string;
}

/** The season after `ref`, in the farm's calendar. */
const after = (state: FarmState, ref: SeasonRef): SeasonRef =>
  seasonOf(addDays(seasonDays(ref, state.hemisphere).last, 1), state.hemisphere);

/**
 * Harvest day's basket to show `me`: the latest basket with something in it, from this season or
 * the one just rolled over, once per season, to a member who was on the farm before that season
 * ended. Nothing bloomed means no basket moment: everything simply rests.
 */
export function harvestToShow(
  state: FarmState,
  me: PersonId,
  seenSeason: string | null,
): Harvest | null {
  const basket = state.kind === 'farm' ? state.basket : null;
  const self = state.members.find((m) => m.person === me);
  if (!basket || !self || basket.crops.length === 0) return null;
  const recent =
    sameSeason(basket.season, state.season) ||
    sameSeason(after(state, basket.season), state.season);
  if (!recent || seenSeason === seasonKey(basket.season)) return null;
  const ended = addDays(seasonDays(basket.season, state.hemisphere).last, 1);
  const end = (() => {
    try {
      return startOfDay(ended, state.timeZone);
    } catch {
      return startOfDay(ended, 'UTC');
    }
  })();
  if (self.joinedAt >= end) return null;
  return { season: basket.season, crops: basket.crops, key: seasonKey(basket.season) };
}
