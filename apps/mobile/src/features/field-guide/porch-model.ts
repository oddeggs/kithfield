import type {
  Credit,
  EpochMs,
  FarmState,
  PersonId,
  PlantStage,
  Season,
} from '@kithfield/contracts';
import { PORCH_POT, SEASONS, SEASON_START_MONTH, aliasOf } from '@kithfield/farm';

/*
 * A visit's porch pot and its little scrapbook: one plant a season grown by both people, pressed
 * when it blooms. Never in a farm's field guide. Names and kinds of care, never totals.
 */

export interface ScrapbookCard {
  readonly season: Season;
  readonly plant: string;
  /** Pressed, growing now, or waiting for its season to come round. */
  readonly kind: 'pressed' | 'growing' | 'waiting';
  readonly pressedAt: EpochMs | null;
  readonly stage: PlantStage;
  /** The month its season starts in the visit's calendar (1–12), for "waiting for December". */
  readonly startMonth: number;
}

/** The four cards, spring to winter: the latest bloom pressed in each season, or what's to come. */
export function scrapbookCards(state: FarmState): ScrapbookCard[] {
  const pot = state.pot;
  return SEASONS.map((season) => {
    const pressed = (pot?.pressed ?? [])
      .filter((p) => p.season.season === season)
      .sort((a, b) => b.pressedAt - a.pressedAt)[0];
    const startMonth = SEASON_START_MONTH[state.hemisphere][season];
    if (pressed) {
      return {
        season,
        plant: pressed.plant,
        kind: 'pressed',
        pressedAt: pressed.pressedAt,
        stage: 3,
        startMonth,
      };
    }
    const growing = pot !== null && state.season.season === season;
    return {
      season,
      plant: growing ? pot.plant : PORCH_POT[season],
      kind: growing ? 'growing' : 'waiting',
      pressedAt: null,
      stage: growing ? pot.stage : 1,
      startMonth,
    };
  });
}

/** Seasons with a pressed bloom: "two blooms pressed so far". */
export const pressedCount = (state: FarmState): number =>
  new Set((state.pot?.pressed ?? []).map((p) => `${p.season.year}-${p.season.season}`)).size;

/** The stage bar, seed to harvest: which steps are reached. */
export const stageBar = (stage: PlantStage): boolean[] => [0, 1, 2, 3, 4].map((s) => s <= stage);

export interface Watered {
  /** The first kind of care this person gave the pot this season, or null if none yet. */
  readonly mine: string | null;
  /** The other person, and the first kind of care they gave. */
  readonly theirs: { readonly person: PersonId; readonly kind: string } | null;
}

/** Who watered the pot this season, by name and kind of care. */
export function wateredBy(state: FarmState, me: PersonId): Watered {
  const credits: readonly Credit[] = state.pot?.credits ?? [];
  const first = (c: Credit | undefined) => c?.kinds[0] ?? null;
  const mine = credits.find((c) => aliasOf(state, c.person) === me);
  const theirs = credits.find((c) => aliasOf(state, c.person) !== me);
  const kind = first(theirs);
  return {
    mine: first(mine),
    theirs: theirs && kind ? { person: aliasOf(state, theirs.person), kind } : null,
  };
}

/** The other person on the porch, as they are now or as they were when they left. */
export function otherOnPorch(state: FarmState, me: PersonId) {
  return (
    state.members.find((m) => m.person !== me) ??
    state.former.find((f) => aliasOf(state, f.person) !== me) ??
    null
  );
}

/** The porch is frozen when one of the two has gone: the pot and scrapbook stay readable. */
export const porchFrozen = (state: FarmState): boolean => state.frozen || state.members.length < 2;
