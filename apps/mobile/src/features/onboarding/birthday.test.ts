import { describe, expect, it } from '@jest/globals';

import { daysIn, isComplete, monthDayOf, noBirthday, withPart, yearsUpTo } from './birthday';

describe('birthdays', () => {
  it('knows the days in each month', () => {
    expect(daysIn(2, 2024)).toBe(29);
    expect(daysIn(2, 2023)).toBe(28);
    expect(daysIn(2, null)).toBe(29);
    expect(daysIn(4, null)).toBe(30);
    expect(daysIn(null, null)).toBe(31);
  });

  it('drops a day the new month does not have', () => {
    const b = withPart(withPart(noBirthday, 'day', 31), 'month', 1);
    expect(b).toEqual({ day: 31, month: 1, year: null });
    expect(withPart(b, 'month', 4).day).toBeNull();
    expect(
      withPart(withPart(withPart(noBirthday, 'month', 2), 'day', 29), 'year', 2023).day,
    ).toBeNull();
  });

  it('keeps only the day and month', () => {
    const b = { day: 4, month: 6, year: 1998 };
    expect(isComplete(b)).toBe(true);
    expect(monthDayOf(b)).toBe('06-04');
    expect(monthDayOf(noBirthday)).toBeNull();
  });

  it('lists years newest first', () => {
    const years = yearsUpTo(2026);
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(1906);
  });
});
