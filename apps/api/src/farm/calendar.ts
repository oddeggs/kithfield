import type { EpochMs, LocalDate, TimeZone } from '@kithfield/contracts';
import { addDays, localDay } from '@kithfield/farm';

/*
 * Wall-clock times in a time zone: when the weather is fetched and when a slow post arrives. Farm
 * days, seasons and harvest day come from `@kithfield/farm`, so the server and every phone agree.
 */

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

/** The instant a local wall-clock time happens in the zone on a calendar day there. */
export const zonedInstant = (day: LocalDate, hour: number, timeZone: TimeZone): EpochMs => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, date, hour);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
};

/** The next time the local clock reads `hour`:00, strictly after `at`. */
export const nextLocalHour = (at: EpochMs, hour: number, timeZone: TimeZone): EpochMs => {
  const today = localDay(at, timeZone);
  const t = zonedInstant(today, hour, timeZone);
  return t > at ? t : zonedInstant(addDays(today, 1), hour, timeZone);
};
