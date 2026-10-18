import type { LocalDate, LocalTime, SeedState, TimeZone } from '@kithfield/contracts';
import { addDays } from '@kithfield/farm';

import { planTime } from './plan-status';

const HOUR = 3_600_000;
/** How long a plan with a start time runs in the calendar. */
const PLAN_HOURS = 2;

const formats = new Map<string, Intl.DateTimeFormat>();
const formatFor = (timeZone: string) => {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formats.set(timeZone, format);
  }
  return format;
};

/** An instant's wall clock in a zone, read back as if it were UTC. */
const shownAt = (at: number, timeZone: string): number => {
  const parts = formatFor(timeZone).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
};

/**
 * The instant a wall-clock time falls at in a zone. The zone's offset is taken at that time
 * itself, so a day when the clocks change still lands on the right hour; a time that doesn't
 * exist (in a spring-forward gap) moves on by the gap.
 */
export function zonedInstant(day: LocalDate, time: LocalTime, timeZone: string): number {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  const [h = 0, min = 0] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, h, min);
  let at = wanted;
  for (let i = 0; i < 3; i++) at -= shownAt(at, timeZone) - wanted;
  return at;
}

/** This phone's own time zone. */
export const phoneZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * When a plan starts and ends in a calendar. A plan with a start time starts then in the farm's
 * zone and runs two hours; one without is all day, from midnight to midnight on the phone, so the
 * calendar shows it on its own date.
 */
export function calendarTimes(
  seed: SeedState,
  day: LocalDate,
  farmZone: TimeZone,
  phone: string = phoneZone(),
): { start: Date; end: Date; allDay: boolean } {
  const time = planTime(seed, day);
  if (time === null) {
    return {
      start: new Date(zonedInstant(day, '00:00', phone)),
      end: new Date(zonedInstant(addDays(day, 1), '00:00', phone)),
      allDay: true,
    };
  }
  const start = zonedInstant(day, time, farmZone);
  return { start: new Date(start), end: new Date(start + PLAN_HOURS * HOUR), allDay: false };
}
