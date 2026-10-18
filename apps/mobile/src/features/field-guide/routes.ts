import type { FarmId, RareVariant } from '@kithfield/contracts';
import type { Href } from 'expo-router';

/* Where the field guide's screens are, by each route's typed path. */

export const fieldGuideRoutes = {
  /** The guide, open on the farm's current season. */
  guide: (farm: FarmId): Href => ({ pathname: '/(tabs)/farm/field-guide', params: { farm } }),
  /** A plant's page; a rare variant shows that variant's drawing. */
  plant: (farm: FarmId, plant: string, variant?: RareVariant | null): Href => ({
    pathname: '/(tabs)/farm/field-guide-plant',
    params: variant ? { farm, plant, variant } : { farm, plant },
  }),
  seasons: (farm: FarmId): Href => ({
    pathname: '/(tabs)/farm/field-guide-seasons',
    params: { farm },
  }),
  plants: (farm: FarmId): Href => ({
    pathname: '/(tabs)/farm/field-guide-plants',
    params: { farm },
  }),
  /** A visit's porch pot. */
  porchPot: (visit: FarmId): Href => ({
    pathname: '/(tabs)/farm/porch-pot',
    params: { farm: visit },
  }),
  porchScrapbook: (visit: FarmId): Href => ({
    pathname: '/(tabs)/farm/porch-scrapbook',
    params: { farm: visit },
  }),
  /** The full-screen moment for a rare bloom this member hasn't seen. */
  rareBloom: (farm: FarmId, key: string): Href => ({
    pathname: '/(cover)/rhythm-rare-bloom',
    params: { farm, key },
  }),
  /** Harvest day's basket. */
  harvest: (farm: FarmId): Href => ({ pathname: '/(cover)/rhythm-harvest', params: { farm } }),
} as const;

/** A route param as one string: Expo Router gives an array when a key repeats. */
export const oneParam = (value: string | string[] | undefined): string | null => {
  const one = Array.isArray(value) ? value[0] : value;
  return one === undefined || one === '' ? null : one;
};
