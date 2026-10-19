import type { SunPlace } from '../../ui/theme/sun';
import { hemisphereOf } from './calendar';

/**
 * Where the way in takes its sunset from before there is a farm with a town: the phone's clock,
 * never its location. The longitude follows the time zone's standard offset (15° an hour), the
 * latitude the region setting: a typical one for the countries most people here come from, else
 * a mid-latitude for the hemisphere. Close enough for a palette that turns at sunset; the farm's
 * own town takes over once there is one.
 */
const LATITUDES: Readonly<Record<string, number>> = {
  VN: 16,
  US: 38,
  CA: 47,
  GB: 53,
  IE: 53,
  AU: -33,
  NZ: -41,
  SG: 1,
  MY: 4,
  PH: 13,
  TH: 14,
  ID: -4,
  JP: 36,
  KR: 37,
  TW: 24,
  IN: 22,
  DE: 51,
  FR: 47,
  NL: 52,
  BR: -15,
  ZA: -29,
};

const NORTH = 40;
const SOUTH = -30;

/** Minutes east of UTC at an instant, in the phone's own time zone. */
export type OffsetAt = (atMs: number) => number;

const deviceOffset: OffsetAt = (atMs) => -new Date(atMs).getTimezoneOffset();

export function clockSunPlace(
  nowMs: number,
  region: string | null | undefined,
  offsetAt: OffsetAt = deviceOffset,
): SunPlace {
  const year = new Date(nowMs).getUTCFullYear();
  // Summer time moves the clock an hour ahead; the standard offset is the smaller of the two.
  const standard = Math.min(offsetAt(Date.UTC(year, 0, 15)), offsetAt(Date.UTC(year, 6, 15)));
  const lng = Math.max(-180, Math.min(180, (standard / 60) * 15));
  const known = region ? LATITUDES[region.toUpperCase()] : undefined;
  const lat = known ?? (hemisphereOf(region) === 'south' ? SOUTH : NORTH);
  return { lat, lng };
}
