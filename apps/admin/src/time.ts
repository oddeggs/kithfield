import { tr } from './copy';

/*
 * Times as the desk shows them, in the moderator's own time zone (the page tells the Worker in a
 * cookie the first time it loads; until then, UTC).
 *
 * - `clock`: `09:48` today, `Tue 21:52` this week, `14 Sep` before that.
 * - `day`: `Today 10:14`, `Yesterday 22:05`, `Tue 21:52`, `14 Sep`.
 * - `inline`: the same, lower-cased for the middle of a sentence (`sent today 12:30`).
 * - `month`: `Mar 2026`. `monthLong`: `March 2026`.
 */

export type TimeStyle = 'clock' | 'day' | 'inline' | 'month' | 'monthLong' | 'date';

const DAY_MS = 24 * 60 * 60_000;

export function zoneOrUtc(zone: string | undefined): string {
  if (zone === undefined || zone === '') return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

const parts = (at: number, zone: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...options }).format(new Date(at));

const dayKey = (at: number, zone: string) =>
  parts(at, zone, { year: 'numeric', month: '2-digit', day: '2-digit' });

export function formatAt(at: number, style: TimeStyle, zone: string, now: number): string {
  const clock = parts(at, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const shortDate = parts(at, zone, { day: 'numeric', month: 'short' });
  if (style === 'month') return parts(at, zone, { month: 'short', year: 'numeric' });
  if (style === 'monthLong') return parts(at, zone, { month: 'long', year: 'numeric' });
  if (style === 'date') return `${shortDate} ${clock}`;
  const today = dayKey(now, zone) === dayKey(at, zone);
  const yesterday = dayKey(now - DAY_MS, zone) === dayKey(at, zone);
  const thisWeek = now - at < 6 * DAY_MS;
  const weekday = parts(at, zone, { weekday: 'short' });
  if (style === 'clock') {
    if (today) return clock;
    return thisWeek ? `${weekday} ${clock}` : shortDate;
  }
  const lower = style === 'inline';
  if (today) {
    const word = tr('moderation.time.today');
    return `${lower ? word.toLowerCase() : word} ${clock}`;
  }
  if (yesterday) {
    const word = tr('moderation.time.yesterday');
    return `${lower ? word.toLowerCase() : word} ${clock}`;
  }
  return thisWeek ? `${weekday} ${clock}` : shortDate;
}
