import type { LocalDate, SeedState, TimeZone } from '@kithfield/contracts';
import { startOfDay } from '@kithfield/farm';
import { createEventInCalendarAsync } from 'expo-calendar/legacy';

import { planTime } from './plan-status';

const HOUR = 3_600_000;
/** How long a plan with a start time runs in the calendar. */
const PLAN_HOURS = 2;

/** When a plan starts and ends, in the farm's time zone: all day unless it has a time. */
export function calendarTimes(
  seed: SeedState,
  day: LocalDate,
  timeZone: TimeZone,
): { start: Date; end: Date; allDay: boolean } {
  const midnight = startOfDay(day, timeZone);
  const time = planTime(seed, day);
  if (time === null) {
    return { start: new Date(midnight), end: new Date(midnight + 24 * HOUR), allDay: true };
  }
  const [h = 0, m = 0] = time.split(':').map(Number);
  const start = midnight + h * HOUR + m * 60_000;
  return { start: new Date(start), end: new Date(start + PLAN_HOURS * HOUR), allDay: false };
}

/**
 * Adds a sprouted plan to the person's calendar through the system's own sheet: only the event
 * is written, and no calendar access is asked for.
 */
export async function addToCalendar(
  seed: SeedState,
  day: LocalDate,
  timeZone: TimeZone,
): Promise<void> {
  const { start, end, allDay } = calendarTimes(seed, day, timeZone);
  const place = seed.place ? [seed.place.name, seed.place.address].filter(Boolean).join(', ') : '';
  await createEventInCalendarAsync({
    title: seed.title ?? '',
    startDate: start,
    endDate: end,
    allDay,
    ...(place ? { location: place } : {}),
  });
}
