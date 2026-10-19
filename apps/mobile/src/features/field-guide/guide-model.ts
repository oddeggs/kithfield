import type {
  CareFamily,
  EpochMs,
  FarmState,
  FieldGuidePage,
  LocalDate,
  PlantStage,
  RareVariant,
  Season,
  SeasonRef,
} from '@kithfield/contracts';
import {
  FAMILIES,
  PLANT_BY_ID,
  RARE_VARIANTS,
  SEASONS,
  SLEEPY_AFTER_DAYS,
  addDays,
  localDay,
  plantFor,
  sameSeason,
  seasonDays,
  seasonOf,
  type CatalogPlantId,
  type FarmView,
  type PlantEntry,
} from '@kithfield/farm';

/*
 * The field guide worked out from the farm: which family plant each season's page has found,
 * which is growing now, which rested through a season the farm lived and which the farm hasn't
 * met yet. Pages are plants (a count of what's there), never care.
 */

export type GuideStatus =
  | { readonly kind: 'found'; readonly page: FieldGuidePage }
  | { readonly kind: 'growing'; readonly stage: PlantStage; readonly sleepy: boolean }
  | { readonly kind: 'resting' }
  | { readonly kind: 'notYet' };

export interface GuideRow {
  readonly plant: string;
  readonly family: CareFamily;
  readonly status: GuideStatus;
}

/** How a status draws a plant: `scene="plant"` attributes, and whether it is a grey sketch. */
export interface TileLook {
  readonly stage: number;
  readonly state: string;
  readonly sketch: boolean;
}

/** The farm day an instant fell on, in the farm's zone (UTC when this phone doesn't know it). */
export function dayIn(state: Pick<FarmState, 'timeZone'>, at: EpochMs): LocalDate {
  try {
    return localDay(at, state.timeZone);
  } catch {
    return localDay(at, 'UTC');
  }
}

/** When the farm began, as its sleepiness counts it: the earliest anyone joined. */
export function farmSince(state: FarmState): EpochMs | null {
  const times = [...state.members.map((m) => m.joinedAt), ...state.former.map((f) => f.joinedAt)];
  return times.length > 0 ? Math.min(...times) : null;
}

const nextSeason = (ref: SeasonRef, state: FarmState): SeasonRef =>
  seasonOf(addDays(seasonDays(ref, state.hemisphere).last, 1), state.hemisphere);

/**
 * The seasons the farm has lived through before the one it is in now, since its earliest member
 * joined. A family plant of one of these seasons that never bloomed is resting; of any other
 * season, it is still to come.
 */
export function seasonsLived(state: FarmState): ReadonlySet<Season> {
  const lived = new Set<Season>();
  const since = farmSince(state);
  if (since === null) return lived;
  const now = seasonDays(state.season, state.hemisphere).first;
  let ref = seasonOf(dayIn(state, since), state.hemisphere);
  // After four steps every season has been seen; the walk is bounded however old the farm is.
  for (let i = 0; i < 8 && lived.size < 4; i++) {
    if (sameSeason(ref, state.season) || seasonDays(ref, state.hemisphere).first > now) break;
    lived.add(ref.season);
    ref = nextSeason(ref, state);
  }
  return lived;
}

/** The farm's page for a plant: its plain bloom first, else the first rare one it found. */
export function pageFor(state: FarmState, plant: string): FieldGuidePage | null {
  const pages = state.fieldGuide.filter((p) => p.plant === plant);
  return pages.find((p) => p.variant === null) ?? pages[0] ?? null;
}

/** The six family rows of one season's page, in the families' order. */
export function guideRows(state: FarmState, view: FarmView | null, season: Season): GuideRow[] {
  const lived = seasonsLived(state);
  const current = state.season.season === season;
  return FAMILIES.map((family) => {
    const plant = plantFor(family, season);
    const page = pageFor(state, plant);
    if (page) return { plant, family, status: { kind: 'found', page } };
    if (current) {
      const now = state.plants.find((p) => p.plant === plant);
      const sleepy = view?.plants.find((p) => p.plant === plant)?.sleepy ?? false;
      return { plant, family, status: { kind: 'growing', stage: now?.stage ?? 0, sleepy } };
    }
    return { plant, family, status: { kind: lived.has(season) ? 'resting' : 'notYet' } };
  });
}

/** How many of a page's six plants the farm has found. */
export const foundCount = (rows: readonly GuideRow[]): number =>
  rows.filter((r) => r.status.kind === 'found').length;

/** The bud as a pencil sketch for a plant still to come; a bloom once found; sleepy at rest. */
export function tileLook(status: GuideStatus): TileLook {
  switch (status.kind) {
    case 'found':
      return { stage: 3, state: '', sketch: false };
    case 'growing':
      return { stage: status.stage, state: status.sleepy ? 'sleepy' : '', sketch: false };
    case 'resting':
      return { stage: 3, state: 'sleepy', sketch: false };
    case 'notYet':
      return { stage: 2, state: '', sketch: true };
  }
}

/** The farm's rare pages, newest first. */
export const rarePages = (state: FarmState): FieldGuidePage[] =>
  state.fieldGuide.filter((p) => p.variant !== null).sort((a, b) => b.foundAt - a.foundAt);

/** The art state that draws a rare variant (`rain`, `frost`, `gold`). */
export const variantArt = (variant: RareVariant): string =>
  RARE_VARIANTS.find((v) => v.id === variant)?.artState ?? '';

export const entryOf = (plant: string): PlantEntry | null =>
  PLANT_BY_ID.get(plant as CatalogPlantId) ?? null;

/** Days without a tend of its family before a plant naps; null for the rose, which never naps. */
export function sleepyDays(entry: PlantEntry, current: Season): number | null {
  if (entry.role === 'rose') return null;
  return SLEEPY_AFTER_DAYS[entry.season ?? current];
}

/** The six stages a page strip shows, the last being sleepy (bloom drawn napping). */
export const STRIP = [
  { stage: 0, state: '' },
  { stage: 1, state: '' },
  { stage: 2, state: '' },
  { stage: 3, state: '' },
  { stage: 4, state: '' },
  { stage: 3, state: 'sleepy' },
] as const;

/** Which strip drawing is outlined for a status: found and resting show bloom and sleepy. */
export function stripIndex(status: GuideStatus): number | null {
  switch (status.kind) {
    case 'found':
      return 3;
    case 'growing':
      return status.sleepy ? 5 : status.stage;
    case 'resting':
      return 5;
    case 'notYet':
      return null;
  }
}

/** The season every list opens on: the farm's own. */
export const seasonOrder = SEASONS;

/** A plant's status on its page: a family plant as its season's page has it, the signature crop
 * found or growing; null for the rose and the porch pot, which the guide doesn't count. */
export function plantStatus(
  state: FarmState,
  view: FarmView | null,
  entry: PlantEntry,
): GuideStatus | null {
  if (entry.role === 'family' && entry.family && entry.season) {
    return guideRows(state, view, entry.season).find((r) => r.plant === entry.id)?.status ?? null;
  }
  if (entry.role !== 'signature') return null;
  const page = pageFor(state, entry.id);
  if (page) return { kind: 'found', page };
  const now = state.plants.find((p) => p.plant === entry.id);
  if (!now) return { kind: 'notYet' };
  const sleepy = view?.plants.find((p) => p.plant === entry.id)?.sleepy ?? false;
  return { kind: 'growing', stage: now.stage, sleepy };
}
