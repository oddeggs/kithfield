import { describe, expect, it } from '@jest/globals';

import { isAfterSunset } from '../../ui/theme/sun';
import { clockSunPlace, type OffsetAt } from './clock-place';

const fixed =
  (minutes: number): OffsetAt =>
  () =>
    minutes;
/** A zone with summer time: an hour more east of UTC from April to October. */
const withSummer =
  (standard: number): OffsetAt =>
  (atMs) => {
    const month = new Date(atMs).getUTCMonth();
    return month >= 3 && month <= 9 ? standard + 60 : standard;
  };

const NOW = Date.UTC(2026, 9, 19, 12);

describe("the way in's sunset before there is a farm", () => {
  it('takes the longitude from the standard offset, never summer time', () => {
    expect(clockSunPlace(NOW, 'VN', fixed(7 * 60))).toEqual({ lat: 16, lng: 105 });
    expect(clockSunPlace(NOW, 'GB', withSummer(0))).toEqual({ lat: 53, lng: 0 });
    expect(clockSunPlace(NOW, 'US', withSummer(-5 * 60))).toEqual({ lat: 38, lng: -75 });
    expect(clockSunPlace(NOW, 'NZ', withSummer(12 * 60)).lng).toBe(180);
    expect(clockSunPlace(NOW, null, fixed(14 * 60)).lng).toBe(180);
  });

  it("takes a typical latitude for the region, else one for the region's hemisphere", () => {
    expect(clockSunPlace(NOW, 'au', fixed(10 * 60)).lat).toBe(-33);
    expect(clockSunPlace(NOW, 'AR', fixed(-3 * 60)).lat).toBe(-30);
    expect(clockSunPlace(NOW, 'ES', fixed(60)).lat).toBe(40);
    expect(clockSunPlace(NOW, undefined, fixed(0)).lat).toBe(40);
  });

  it('turns to night after sunset in Hanoi and stays day at noon', () => {
    const hanoi = clockSunPlace(NOW, 'VN', fixed(7 * 60));
    // 19:00 and 12:00 in Hanoi (UTC+7), on an October day.
    expect(isAfterSunset(Date.UTC(2026, 9, 19, 12), hanoi)).toBe(true);
    expect(isAfterSunset(Date.UTC(2026, 9, 19, 5), hanoi)).toBe(false);
  });
});
