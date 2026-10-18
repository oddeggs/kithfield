import { describe, expect, it } from 'vitest';

import {
  harvestDay,
  localDate,
  nextLocalHour,
  nextSeasonStart,
  seasonOf,
  zonedInstant,
} from '../../src/farm/calendar';
import { matchOf } from '../../src/farm/history';

const ymd = (year: number, month: number, day: number) => ({ year, month, day });

describe('seasons', () => {
  it.each([
    [ymd(2027, 1, 15), 'north', { season: 'winter', year: 2026 }],
    [ymd(2026, 12, 1), 'north', { season: 'winter', year: 2026 }],
    [ymd(2027, 3, 1), 'north', { season: 'spring', year: 2027 }],
    [ymd(2027, 7, 31), 'north', { season: 'summer', year: 2027 }],
    [ymd(2026, 10, 18), 'north', { season: 'autumn', year: 2026 }],
    [ymd(2027, 1, 15), 'south', { season: 'summer', year: 2026 }],
    [ymd(2027, 4, 2), 'south', { season: 'autumn', year: 2027 }],
    [ymd(2027, 7, 2), 'south', { season: 'winter', year: 2027 }],
    [ymd(2026, 10, 18), 'south', { season: 'spring', year: 2026 }],
  ] as const)('%o in the %s is %o', (day, hemisphere, season) => {
    expect(seasonOf(day, hemisphere)).toEqual(season);
  });

  it('harvests on the last Sunday of each season', () => {
    expect(harvestDay(ymd(2026, 9, 1))).toEqual(ymd(2026, 11, 29));
    expect(harvestDay(ymd(2026, 12, 1))).toEqual(ymd(2027, 2, 28));
    expect(harvestDay(ymd(2027, 3, 1))).toEqual(ymd(2027, 5, 30));
    expect(harvestDay(ymd(2027, 6, 1))).toEqual(ymd(2027, 8, 29));
  });

  it('finds the next season’s first day, across the new year', () => {
    expect(nextSeasonStart(Date.UTC(2026, 11, 15), 'UTC')).toEqual(ymd(2027, 3, 1));
    expect(nextSeasonStart(Date.UTC(2027, 1, 27), 'UTC')).toEqual(ymd(2027, 3, 1));
    expect(nextSeasonStart(Date.UTC(2026, 10, 30, 23, 30), 'Asia/Ho_Chi_Minh')).toEqual(
      ymd(2027, 3, 1),
    );
  });
});

describe('farm time', () => {
  it('turns a local wall-clock time into an instant, through daylight saving changes', () => {
    expect(zonedInstant(ymd(2026, 10, 24), 9, 'Europe/London')).toBe(Date.UTC(2026, 9, 24, 8));
    expect(zonedInstant(ymd(2026, 10, 25), 9, 'Europe/London')).toBe(Date.UTC(2026, 9, 25, 9));
    expect(zonedInstant(ymd(2026, 11, 29), 0, 'Australia/Sydney')).toBe(Date.UTC(2026, 10, 28, 13));
    expect(zonedInstant(ymd(2026, 6, 1), 0, 'Asia/Ho_Chi_Minh')).toBe(Date.UTC(2026, 4, 31, 17));
  });

  it('knows the local day and the next time the clock reads an hour', () => {
    expect(localDate(Date.UTC(2026, 9, 18, 23, 30), 'Asia/Ho_Chi_Minh')).toBe('2026-10-19');
    expect(nextLocalHour(Date.UTC(2026, 9, 18, 3), 5, 'Europe/London')).toBe(
      Date.UTC(2026, 9, 18, 4),
    );
    expect(nextLocalHour(Date.UTC(2026, 9, 18, 4), 5, 'Europe/London')).toBe(
      Date.UTC(2026, 9, 19, 4),
    );
  });
});

describe('search queries', () => {
  it('quotes every word as a prefix, so no input is FTS syntax', () => {
    expect(matchOf('  picnic  "OR" ')).toBe('"picnic"* """OR"""*');
    expect(matchOf('   ')).toBeNull();
  });
});
