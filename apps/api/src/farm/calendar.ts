import type {
  EpochMs,
  Hemisphere,
  LocalDate,
  Season,
  SeasonRef,
  TimeZone,
} from '@kithfield/contracts';

/*
 * When the farm's alarms are due: local days, meteorological seasons and harvest day, all in the
 * farm's time zone. Season boundaries fall on the same dates in both hemispheres (1 March, June,
 * September and December); only the names differ.
 */

type Ymd = { year: number; month: number; day: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatter = (timeZone: TimeZone): Intl.DateTimeFormat => {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
};

const wallClock = (at: EpochMs, timeZone: TimeZone) => {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(at)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const n = (k: string) => parts[k] ?? 0;
  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    hour: n('hour'),
    minute: n('minute'),
    second: n('second'),
  };
};

/** How far the zone's wall clock is ahead of UTC at that instant. */
const offsetAt = (at: EpochMs, timeZone: TimeZone): number => {
  const w = wallClock(at, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(at / 1000) * 1000;
};

/** The instant a local wall-clock time happens in the zone. */
export const zonedInstant = (date: Ymd, hour: number, timeZone: TimeZone): EpochMs => {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
};

const pad = (n: number) => String(n).padStart(2, '0');

export const formatDate = (d: Ymd): LocalDate => `${d.year}-${pad(d.month)}-${pad(d.day)}`;

export const localYmd = (at: EpochMs, timeZone: TimeZone): Ymd => {
  const w = wallClock(at, timeZone);
  return { year: w.year, month: w.month, day: w.day };
};

export const localDate = (at: EpochMs, timeZone: TimeZone): LocalDate =>
  formatDate(localYmd(at, timeZone));

export const addDays = (d: Ymd, days: number): Ymd => {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};

/** 0 is Sunday. */
export const weekday = (d: Ymd): number =>
  new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();

/** The next time the local clock reads `hour`:00, strictly after `at`. */
export const nextLocalHour = (at: EpochMs, hour: number, timeZone: TimeZone): EpochMs => {
  const today = localYmd(at, timeZone);
  const t = zonedInstant(today, hour, timeZone);
  return t > at ? t : zonedInstant(addDays(today, 1), hour, timeZone);
};

const NORTH: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];
const SOUTH: readonly Season[] = ['summer', 'autumn', 'winter', 'spring'];

/** The first month (1–12) of the meteorological season a month falls in. */
const seasonStartMonth = (month: number): number => {
  const m = month - (month % 3);
  return m === 0 ? 12 : m;
};

/** The season a local day falls in. `year` is the year the season starts in. */
export const seasonOf = (d: Ymd, hemisphere: Hemisphere): SeasonRef => {
  const start = seasonStartMonth(d.month);
  const index = Math.floor((start % 12) / 3);
  const season = (hemisphere === 'north' ? NORTH : SOUTH)[index] ?? 'winter';
  return { season, year: start === 12 && d.month < 12 ? d.year - 1 : d.year };
};

/** The first local day of the season after the one `at` falls in. */
export const nextSeasonStart = (at: EpochMs, timeZone: TimeZone): Ymd => {
  const d = localYmd(at, timeZone);
  const start = seasonStartMonth(d.month);
  const month = start + 3 > 12 ? start + 3 - 12 : start + 3;
  const year = start === 12 ? (d.month === 12 ? d.year + 1 : d.year) : d.year;
  return { year, month, day: 1 };
};

/** The first local day of the season `at` falls in. */
export const seasonStart = (at: EpochMs, timeZone: TimeZone): Ymd => {
  const d = localYmd(at, timeZone);
  const start = seasonStartMonth(d.month);
  return { year: start === 12 && d.month < 12 ? d.year - 1 : d.year, month: start, day: 1 };
};

/** Harvest day: the last Sunday of the season that starts on `start`. */
export const harvestDay = (start: Ymd): Ymd => {
  const next =
    start.month + 3 > 12
      ? { ...start, year: start.year + 1, month: start.month - 9 }
      : { ...start, month: start.month + 3 };
  let day = addDays(next, -1);
  while (weekday(day) !== 0) day = addDays(day, -1);
  return day;
};
