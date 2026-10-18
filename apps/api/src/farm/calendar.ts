import type { EpochMs, TimeZone } from '@kithfield/contracts';

/*
 * Wall-clock times in a time zone: when the weather is fetched and when a slow post arrives. Farm
 * days, seasons and harvest day come from `@kithfield/farm`, so the server and every phone agree.
 */

export type Ymd = { year: number; month: number; day: number };

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

export const localYmd = (at: EpochMs, timeZone: TimeZone): Ymd => {
  const w = wallClock(at, timeZone);
  return { year: w.year, month: w.month, day: w.day };
};

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
