import type { Hemisphere } from '@kithfield/contracts';

/*
 * A new farm's calendar, from the creator's device settings and never their location
 * (`docs/farm-model.md` §6): the device's time zone, and the hemisphere of the region it is set
 * to. The keeper can change both later in farm settings.
 */

/** Regions that lie wholly or mostly south of the equator. */
const SOUTH = new Set([
  'AO',
  'AR',
  'AU',
  'BO',
  'BR',
  'BW',
  'CL',
  'FJ',
  'ID',
  'KM',
  'LS',
  'MG',
  'MU',
  'MW',
  'MZ',
  'NA',
  'NC',
  'NZ',
  'PE',
  'PF',
  'PG',
  'PY',
  'RE',
  'SB',
  'SC',
  'SZ',
  'TL',
  'TO',
  'TZ',
  'UY',
  'VU',
  'WS',
  'YT',
  'ZA',
  'ZM',
  'ZW',
]);

export function hemisphereOf(region: string | null | undefined): Hemisphere {
  return region && SOUTH.has(region.toUpperCase()) ? 'south' : 'north';
}

/** The device's time zone, or UTC when it can't say. */
export function deviceTimeZone(fromCalendar: string | null | undefined): string {
  if (fromCalendar) return fromCalendar;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
