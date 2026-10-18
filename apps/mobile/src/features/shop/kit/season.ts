import type { Season } from '@kithfield/contracts';
import { localDay, seasonOf } from '@kithfield/farm';
import { useLocalSearchParams } from 'expo-router';

/**
 * The season the shop's art is drawn in: this phone's own day, northern seasons (the cart is the
 * same everywhere).
 */
export function currentSeason(now: number = Date.now()): Season {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return seasonOf(localDay(now, zone), 'north').season;
  } catch {
    return seasonOf(new Date(now).toISOString().slice(0, 10), 'north').season;
  }
}

/** A shop route's string parameters, each the first value given or empty. */
export function useShopParams<K extends string>(...names: readonly K[]): Record<K, string> {
  const raw = useLocalSearchParams<Record<string, string | string[]>>();
  const out = {} as Record<K, string>;
  for (const name of names) {
    const v = raw[name];
    out[name] = (Array.isArray(v) ? v[0] : v) ?? '';
  }
  return out;
}
