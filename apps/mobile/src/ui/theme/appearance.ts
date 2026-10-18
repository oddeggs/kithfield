import type { Appearance } from '@kithfield/theme';

import { isAfterSunset, nextSunChange, type SunPlace } from './sun';

/** The longest the theme waits before looking at the sun again (clock changes, time zones). */
export const SUN_RECHECK_MAX_MS = 15 * 60_000;

export interface AppearanceInputs {
  /** The system appearance: dark uses the night palette everywhere. */
  systemDark: boolean;
  /** The farm's town, when one is known; without it only the system appearance decides. */
  place: SunPlace | null;
  nowMs: number;
  /** A fixed appearance (the developer gallery, previews), overriding both. */
  forced?: Appearance | null;
}

/**
 * Night after local sunset and in dark appearance (`01 Foundations`, Colour). Day otherwise.
 */
export function resolveAppearance({
  systemDark,
  place,
  nowMs,
  forced,
}: AppearanceInputs): Appearance {
  if (forced) return forced;
  if (systemDark) return 'night';
  return place !== null && isAfterSunset(nowMs, place) ? 'night' : 'day';
}

/** How long until the appearance should be looked at again, or null if only the system decides. */
export function recheckDelay(nowMs: number, place: SunPlace | null): number | null {
  if (place === null) return null;
  const next = nextSunChange(nowMs, place) - nowMs;
  return Math.max(1_000, Math.min(next + 1_000, SUN_RECHECK_MAX_MS));
}
