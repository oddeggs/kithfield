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
 *
 * Needs `Intl.DateTimeFormat` with IANA time zones and `formatToParts`: Workers have it, and so
 * does Hermes with Intl on iOS and Android. A zone the device's time zone data doesn't know is
 * never guessed at: it throws `UnknownTimeZoneError`, and the caller takes the farm's snapshot.
 */

/** The device's time zone data doesn't know the farm's zone, so it can't tell the farm's day. */
export class UnknownTimeZoneError extends Error {
  readonly timeZone: string;
  constructor(timeZone: string) {
    super(`Unknown time zone: ${timeZone}`);
    this.name = 'UnknownTimeZoneError';
    this.timeZone = timeZone;
  }
}

const formats = new Map<string, Intl.DateTimeFormat>();

const formatFor = (timeZone: string): Intl.DateTimeFormat => {
  let format = formats.get(timeZone);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      throw new UnknownTimeZoneError(timeZone);
    }
    formats.set(timeZone, format);
  }
  return format;
};

/** Whether this device can tell days in a time zone. */
export const isKnownTimeZone = (timeZone: string): boolean => {
  try {
    formatFor(timeZone);
    return true;
  } catch {
    return false;
  }
};

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

const toDay = (year: number, month: number, day: number): LocalDate =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** The wall-clock fields of an instant in a time zone. */
const wallClock = (at: EpochMs, timeZone: TimeZone) => {
  const parts = formatFor(timeZone).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
};

/** The calendar day of an instant in a time zone, `YYYY-MM-DD`. Throws `UnknownTimeZoneError`. */
export const localDay = (at: EpochMs, timeZone: TimeZone): LocalDate => {
  const w = wallClock(at, timeZone);
  return toDay(w.year, w.month, w.day);
};

/** The instant a farm day starts (local midnight, or the first instant after it in a DST gap). */
export const startOfDay = (day: LocalDate, timeZone: TimeZone): EpochMs => {
  const { year, month, day: date } = dayParts(day);
  const midnight = Date.UTC(year, month - 1, date);
  let at = midnight;
  for (let i = 0; i < 3; i++) {
    const w = wallClock(at, timeZone);
    const shown = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
    at = at - (shown - midnight);
  }
  // Step forward past a gap so the instant falls on the day itself.
  while (localDay(at, timeZone) < day) at += 15 * 60_000;
  return at;
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
