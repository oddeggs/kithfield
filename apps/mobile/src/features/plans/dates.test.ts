import { describe, expect, it } from '@jest/globals';
import { translator } from '@kithfield/i18n';

import {
  dayMentioned,
  formatDay,
  formatDays,
  formatTime,
  nudgeTimes,
  settleDayFor,
  weekOf,
  weekendChoices,
} from './dates';

const en = translator('en');
const vi = translator('vi');

describe('plan days', () => {
  it('offers the coming weekend and the one after', () => {
    // Sunday 18 October 2026.
    expect(weekendChoices('2026-10-18')).toEqual({
      saturday: '2026-10-24',
      sunday: '2026-10-25',
      nextSaturday: '2026-10-31',
    });
    // On a Saturday, the coming weekend is the next one.
    expect(weekendChoices('2026-10-24').saturday).toBe('2026-10-31');
    // On a Friday, it is tomorrow.
    expect(weekendChoices('2026-10-23').saturday).toBe('2026-10-24');
  });

  it('says days as the design does, naming the month only when it changes', () => {
    expect(formatDay(en, '2026-10-24')).toBe('Sat 24 Oct');
    expect(formatDays(en, ['2026-10-24', '2026-10-25', '2026-11-01'])).toEqual([
      'Sat 24 Oct',
      'Sun 25',
      'Sun 1 Nov',
    ]);
    expect(formatDay(vi, '2026-10-24')).toBe('T7, 24 thg 10');
  });

  it('says times in each language', () => {
    expect(formatTime(en, '16:00')).toBe('4pm');
    expect(formatTime(en, '09:30')).toBe('9:30am');
    expect(formatTime(en, '00:00')).toBe('12am');
    expect(formatTime(vi, '16:00')).toBe('4 chiều');
  });

  it('settles two days before the earliest day, never before today', () => {
    expect(settleDayFor(['2026-10-25', '2026-10-24'], '2026-10-18')).toBe('2026-10-22');
    expect(settleDayFor(['2026-10-19'], '2026-10-18')).toBe('2026-10-18');
    expect(settleDayFor([], '2026-10-18')).toBeNull();
  });

  it('lays a week out from Monday', () => {
    expect(weekOf('2026-10-24')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });
});

describe('remember-me nudges', () => {
  // Monday 19 October 2026, noon, in this phone's time.
  const monday = new Date(2026, 9, 19, 12);

  it('finds the day a message is about', () => {
    expect(dayMentioned('big interview on thursday. wish me luck', monday).getDate()).toBe(22);
    expect(dayMentioned('phỏng vấn vào thứ năm nhé', monday).getDate()).toBe(22);
    expect(dayMentioned('exam tomorrow!', monday).getDate()).toBe(20);
    expect(dayMentioned('wish me luck', monday).getDate()).toBe(19);
    // A day named today is today, not next week.
    expect(dayMentioned('monday blues', monday).getDate()).toBe(19);
  });

  it('nudges the day after, in the morning, the evening or at the weekend', () => {
    const times = nudgeTimes('big interview on thursday', monday);
    expect(times.morning).toEqual(new Date(2026, 9, 23, 9));
    expect(times.evening).toEqual(new Date(2026, 9, 23, 18));
    expect(times.weekend).toEqual(new Date(2026, 9, 24, 10));
  });

  it('never nudges in the past', () => {
    const lateSunday = new Date(2026, 9, 18, 20);
    const times = nudgeTimes('saturday party', lateSunday);
    // About next Saturday, so the Sunday after it.
    expect(times.morning).toEqual(new Date(2026, 9, 25, 9));
    expect(times.weekend).toEqual(new Date(2026, 9, 25, 10));
  });
});
