import type { MonthDay } from '@kithfield/contracts';

export interface Birthday {
  readonly day: number | null;
  readonly month: number | null;
  readonly year: number | null;
}

export const noBirthday: Birthday = { day: null, month: null, year: null };

/** Days in a month (1–12); February has 29 unless a known year says otherwise. */
export function daysIn(month: number | null, year: number | null): number {
  if (month === null) return 31;
  if (month === 2) {
    if (year === null) return 29;
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Changing the month or year keeps the day only while it still exists. */
export function withPart(birthday: Birthday, part: keyof Birthday, value: number): Birthday {
  const next = { ...birthday, [part]: value };
  if (next.day !== null && next.day > daysIn(next.month, next.year)) return { ...next, day: null };
  return next;
}

export const isComplete = (b: Birthday): b is { day: number; month: number; year: number } =>
  b.day !== null && b.month !== null && b.year !== null;

/** The day and month as the API keeps a birthday, `MM-DD`; the year never leaves the check. */
export function monthDayOf(b: Birthday): MonthDay | null {
  if (b.day === null || b.month === null) return null;
  return `${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}

/** The years to pick from: this year back a hundred and twenty, newest first. */
export function yearsUpTo(thisYear: number): number[] {
  return Array.from({ length: 121 }, (_, i) => thisYear - i);
}
