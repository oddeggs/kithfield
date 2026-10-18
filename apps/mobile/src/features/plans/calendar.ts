import type { LocalDate, SeedState, TimeZone } from '@kithfield/contracts';
import { createEventInCalendarAsync } from 'expo-calendar/legacy';

import { calendarTimes } from './calendar-times';

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
