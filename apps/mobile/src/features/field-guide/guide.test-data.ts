import type { FarmState, FieldGuidePage, PlantState, SeasonRef } from '@kithfield/contracts';
import { farmView, type FarmView } from '@kithfield/farm';

import { DAY, T0, farmLog } from '../farm/farm-log.test-data';

/* Farms for the field guide's tests: a real log, then the pieces a test needs set by hand. */

export { DAY, T0 };

/** The Thursday Lot, autumn 2026 in the north, Bea and June living there since `joined`. */
export function lot(joined = T0): FarmState {
  return farmLog(
    [
      ['p_bea', 'sheep'],
      ['p_june', 'rabbit'],
    ],
    joined,
  ).state();
}

export const page = (
  plant: string,
  season: SeasonRef,
  change: Partial<FieldGuidePage> = {},
): FieldGuidePage => ({
  plant,
  variant: null,
  season,
  foundAt: T0,
  via: 'grown',
  ...change,
});

export const autumn: SeasonRef = { season: 'autumn', year: 2026 };
export const summer: SeasonRef = { season: 'summer', year: 2026 };

/** Sets one of this season's plants. */
export const withPlant = (state: FarmState, plant: string, change: Partial<PlantState>) => ({
  ...state,
  plants: state.plants.map((p) => (p.plant === plant ? { ...p, ...change } : p)),
});

export const viewAt = (state: FarmState, now = T0): FarmView => farmView(state, now);
