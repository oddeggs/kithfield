/**
 * Local sunrise and sunset, for "night after local sunset" (`01 Foundations`, Colour; `12 States`,
 * Day and night). The sunrise equation with the standard −0.833° horizon (refraction and the
 * sun's radius): within a minute or two of published tables, which is all a palette swap needs.
 */

/** Where to take the sun from: a farm's town, never the device's location. */
export interface SunPlace {
  lat: number;
  lng: number;
}

export interface SunDay {
  /** Epoch milliseconds, or null on a day the sun never rises or never sets there. */
  sunrise: number | null;
  sunset: number | null;
  /** The sun stays down all day (polar night) or up all day (midnight sun). */
  polar: 'night' | 'day' | null;
}

const DAY_MS = 86_400_000;
const J2000 = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
const RAD = Math.PI / 180;
const HORIZON = -0.833 * RAD;
const OBLIQUITY = 23.4397 * RAD;

const toJulian = (ms: number) => ms / DAY_MS + UNIX_EPOCH_JD;
const fromJulian = (jd: number) => Math.round((jd - UNIX_EPOCH_JD) * DAY_MS);

/** The solar day (sunrise and sunset) whose noon is nearest `atMs` at `place`. */
export function sunDay(atMs: number, place: SunPlace): SunDay {
  return sunDayNumber(Math.round(toJulian(atMs) - J2000 + place.lng / 360), place);
}

function sunDayNumber(n: number, { lat, lng }: SunPlace): SunDay {
  const meanNoon = n - lng / 360;
  const M = (((357.5291 + 0.98560028 * meanNoon) % 360) + 360) % 360;
  const Mr = M * RAD;
  const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const lambda = ((M + C + 180 + 102.9372) % 360) * RAD;
  const transit = J2000 + meanNoon + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lambda);
  const declination = Math.asin(Math.sin(lambda) * Math.sin(OBLIQUITY));
  const phi = lat * RAD;
  const cosHour =
    (Math.sin(HORIZON) - Math.sin(phi) * Math.sin(declination)) /
    (Math.cos(phi) * Math.cos(declination));
  if (cosHour > 1) return { sunrise: null, sunset: null, polar: 'night' };
  if (cosHour < -1) return { sunrise: null, sunset: null, polar: 'day' };
  const half = Math.acos(cosHour) / (2 * Math.PI);
  return { sunrise: fromJulian(transit - half), sunset: fromJulian(transit + half), polar: null };
}

/** Whether the sun is down at `place` at `atMs`. */
export function isAfterSunset(atMs: number, place: SunPlace): boolean {
  const d = sunDay(atMs, place);
  if (d.polar !== null) return d.polar === 'night';
  return atMs < (d.sunrise ?? 0) || atMs >= (d.sunset ?? 0);
}

/**
 * When the answer of `isAfterSunset` next changes, in epoch milliseconds: the next sunrise or
 * sunset. During polar day or night it is a day later, when the sun is looked at again.
 */
export function nextSunChange(atMs: number, place: SunPlace): number {
  const n = Math.round(toJulian(atMs) - J2000 + place.lng / 360);
  for (let i = 0; i < 3; i++) {
    const d = sunDayNumber(n + i, place);
    if (d.sunrise !== null && d.sunrise > atMs) return d.sunrise;
    if (d.sunset !== null && d.sunset > atMs) return d.sunset;
  }
  return atMs + DAY_MS;
}
