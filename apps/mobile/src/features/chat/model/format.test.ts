import { describe, expect, it } from '@jest/globals';

import { clock, dayPartOf, dividerDay, hourOf, listTime, monthHeading, monthKey } from './format';

const zone = 'Europe/London';
const now = Date.UTC(2026, 9, 18, 12, 0); // Sunday 18 Oct 2026, 13:00 in London

describe('chat times', () => {
  it('says the time today, a weekday this week, a date, then only the month', () => {
    expect(listTime(Date.UTC(2026, 9, 18, 7, 12), now, 'en', zone)).toBe('8:12');
    expect(listTime(Date.UTC(2026, 9, 13, 9, 0), now, 'en', zone)).toBe('Tue');
    expect(listTime(Date.UTC(2026, 9, 2, 9, 0), now, 'en', zone)).toBe('Oct 2');
    expect(listTime(Date.UTC(2026, 8, 1, 9, 0), now, 'en', zone)).toBe('Sep');
  });

  it('names the part of the day a divider falls in', () => {
    expect(dayPartOf(8)).toBe('morning');
    expect(dayPartOf(15)).toBe('afternoon');
    expect(dayPartOf(19)).toBe('afterDinner');
    expect(dayPartOf(23)).toBe('late');
    expect(dayPartOf(3)).toBe('late');
    expect(hourOf(Date.UTC(2026, 9, 15, 18, 30), zone)).toBe(19);
  });

  it('writes the divider day in lowercase', () => {
    expect(dividerDay(now, now, 'en', zone)).toBe('today');
    expect(dividerDay(now - 24 * 3600_000, now, 'en', zone)).toBe('yesterday');
    expect(dividerDay(Date.UTC(2026, 9, 15, 18, 30), now, 'en', zone)).toBe('thursday');
  });

  it('clocks durations and names months', () => {
    expect(clock(168_000)).toBe('2:48');
    expect(clock(4_200)).toBe('0:04');
    expect(monthHeading(Date.UTC(2026, 8, 3), now, 'en')).toBe('September');
    expect(monthHeading(Date.UTC(2025, 8, 3), now, 'en')).toBe('September 2025');
    expect(monthKey(Date.UTC(2026, 8, 3, 12))).toBe('2026-09');
  });
});
