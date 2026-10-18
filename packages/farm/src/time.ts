import {
  type EpochMs,
  type Hemisphere,
  type LocalDate,
  type MonthDay,
  type SeasonRef,
  type TimeZone,
} from '@kithfield/contracts';

import { SEASONS, SEASON_START_MONTH } from './catalog';

/*
 * Farm days and seasons. Days are calendar days in the farm's time zone, so caps and "today" are
 * the same for everyone; seasons are meteorological, by the farm's hemisphere.
 */

const formats = new Map<string, Intl.DateTimeFormat>();

const formatFor = (timeZone: string): Intl.DateTimeFormat => {
  let format = formats.get(timeZone);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      // A zone this device's time zone data doesn't know falls back to UTC rather than failing.
      format = formatFor('UTC');
    }
    formats.set(timeZone, format);
  }
  return format;
};

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

const toDay = (year: number, month: number, day: number): LocalDate =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** The calendar day of an instant in a time zone, `YYYY-MM-DD`. */
export const localDay = (at: EpochMs, timeZone: TimeZone): LocalDate => {
  const parts = formatFor(timeZone).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return toDay(part('year'), part('month'), part('day'));
};

export interface DayParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export const dayParts = (day: LocalDate): DayParts => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return { year, month, day: date };
};

const utcOf = (day: LocalDate) => {
  const { year, month, day: date } = dayParts(day);
  return Date.UTC(year, month - 1, date);
};

const fromUtc = (ms: number): LocalDate => {
  const d = new Date(ms);
  return toDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** Days from `a` to `b` (positive when `b` is later). */
export const daysBetween = (a: LocalDate, b: LocalDate): number =>
  Math.round((utcOf(b) - utcOf(a)) / 86_400_000);

export const addDays = (day: LocalDate, days: number): LocalDate =>
  fromUtc(utcOf(day) + days * 86_400_000);

/** 0 for Sunday through 6 for Saturday. */
export const weekday = (day: LocalDate): number => new Date(utcOf(day)).getUTCDay();

/** The later of two days. */
export const laterDay = (a: LocalDate, b: LocalDate): LocalDate => (a >= b ? a : b);

/** The season a farm day falls in; `year` is the year the season starts. */
export const seasonOf = (day: LocalDate, hemisphere: Hemisphere): SeasonRef => {
  const { year, month } = dayParts(day);
  for (const season of SEASONS) {
    const start = SEASON_START_MONTH[hemisphere][season];
    if ((month - start + 12) % 12 < 3) return { season, year: month >= start ? year : year - 1 };
  }
  return { season: 'spring', year };
};

export const sameSeason = (a: SeasonRef, b: SeasonRef): boolean =>
  a.season === b.season && a.year === b.year;

/** The first and last farm day of a season. */
export const seasonDays = (
  ref: SeasonRef,
  hemisphere: Hemisphere,
): { first: LocalDate; last: LocalDate } => {
  const start = SEASON_START_MONTH[hemisphere][ref.season];
  const first = toDay(ref.year, start, 1);
  // The day before the first of the month three months on.
  const endMonth = start + 3;
  const next = endMonth > 12 ? toDay(ref.year + 1, endMonth - 12, 1) : toDay(ref.year, endMonth, 1);
  return { first, last: addDays(next, -1) };
};

/** Harvest day: the last Sunday of the season, in farm time. */
export const harvestDay = (ref: SeasonRef, hemisphere: Hemisphere): LocalDate => {
  const { last } = seasonDays(ref, hemisphere);
  return addDays(last, -weekday(last));
};

/** Whether a birthday (`MM-DD`) falls on a farm day. A 29 February birthday is the 28th otherwise. */
export const isBirthday = (birthday: MonthDay, day: LocalDate): boolean => {
  const monthDay = day.slice(5);
  if (birthday === monthDay) return true;
  if (birthday !== '02-29' || monthDay !== '02-28') return false;
  const { year } = dayParts(day);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return !leap;
};
