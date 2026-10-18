import { describe, expect, it } from '@jest/globals';

import { isAfterSunset, nextSunChange, sunDay } from './sun';

const london = { lat: 51.5074, lng: -0.1278 };
const saigon = { lat: 10.7769, lng: 106.7009 };
const tromso = { lat: 69.6492, lng: 18.9553 };
const minutes = (a: number, b: number) => Math.abs(a - b) / 60_000;

describe('local sunset', () => {
  it('matches published times in London at midsummer', () => {
    const d = sunDay(Date.UTC(2026, 5, 21, 12), london);
    // 04:43 and 21:21 BST.
    expect(minutes(d.sunrise ?? 0, Date.UTC(2026, 5, 21, 3, 43))).toBeLessThan(3);
    expect(minutes(d.sunset ?? 0, Date.UTC(2026, 5, 21, 20, 21))).toBeLessThan(3);
  });

  it('matches published times in Saigon, east of Greenwich', () => {
    const d = sunDay(Date.UTC(2026, 9, 18, 5), saigon);
    // 05:41 and 17:32 at UTC+7.
    expect(minutes(d.sunrise ?? 0, Date.UTC(2026, 9, 17, 22, 41))).toBeLessThan(4);
    expect(minutes(d.sunset ?? 0, Date.UTC(2026, 9, 18, 10, 32))).toBeLessThan(4);
  });

  it('is night after sunset and before sunrise, day between', () => {
    expect(isAfterSunset(Date.UTC(2026, 5, 21, 12), london)).toBe(false);
    expect(isAfterSunset(Date.UTC(2026, 5, 21, 21), london)).toBe(true);
    expect(isAfterSunset(Date.UTC(2026, 5, 21, 2), london)).toBe(true);
    // 19:00 in Saigon is 12:00 UTC.
    expect(isAfterSunset(Date.UTC(2026, 9, 18, 12), saigon)).toBe(true);
    expect(isAfterSunset(Date.UTC(2026, 9, 18, 3), saigon)).toBe(false);
  });

  it('stays night through polar night and day through the midnight sun', () => {
    expect(sunDay(Date.UTC(2026, 11, 21, 12), tromso).polar).toBe('night');
    expect(isAfterSunset(Date.UTC(2026, 11, 21, 12), tromso)).toBe(true);
    expect(sunDay(Date.UTC(2026, 5, 21, 0), tromso).polar).toBe('day');
    expect(isAfterSunset(Date.UTC(2026, 5, 21, 0), tromso)).toBe(false);
  });

  it('schedules the next change at the coming sunset, then the next sunrise', () => {
    const noon = Date.UTC(2026, 5, 21, 12);
    const sunset = nextSunChange(noon, london);
    expect(minutes(sunset, Date.UTC(2026, 5, 21, 20, 21))).toBeLessThan(3);
    const sunrise = nextSunChange(sunset + 1, london);
    expect(minutes(sunrise, Date.UTC(2026, 5, 22, 3, 43))).toBeLessThan(3);
    expect(isAfterSunset(sunrise - 60_000, london)).toBe(true);
    expect(isAfterSunset(sunrise + 60_000, london)).toBe(false);
  });
});
