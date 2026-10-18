import type { Hemisphere, LocalDate, Season } from '@kithfield/contracts';
import { seasonOf } from '@kithfield/farm';

/**
 * Countries (ISO 3166 alpha-2) whose people mostly live south of the equator, so a farm planted
 * there turns its seasons the southern way. Taken from the device's region setting, never from
 * where the phone is.
 */
const SOUTHERN = new Set([
  'AR',
  'AU',
  'BO',
  'BR',
  'BW',
  'CL',
  'FJ',
  'LS',
  'MG',
  'MU',
  'MZ',
  'NA',
  'NZ',
  'PE',
  'PY',
  'SZ',
  'UY',
  'ZA',
  'ZM',
  'ZW',
]);

export function hemisphereOf(region: string | null | undefined): Hemisphere {
  return region && SOUTHERN.has(region.toUpperCase()) ? 'south' : 'north';
}

/** A two-letter country for the age check; the device region, or `ZZ` when it has none. */
export function countryOf(region: string | null | undefined): string {
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : 'ZZ';
}

/** Today in the phone's own time zone, `YYYY-MM-DD`. */
export function localDay(now: Date): LocalDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The season the way-in scenes are drawn in: the one outside, by the phone's hemisphere. */
export function seasonNow(now: Date, region: string | null | undefined): Season {
  return seasonOf(localDay(now), hemisphereOf(region)).season;
}
