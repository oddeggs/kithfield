import { describe, expect, it } from '@jest/globals';
import type { SeedState } from '@kithfield/contracts';

import { calendarTimes } from './calendar-times';

const seed = (days: SeedState['days']): SeedState => ({
  seq: 1,
  planter: 'pip',
  unsent: false,
  title: 'Picnic by the river',
  days,
  place: null,
  yeses: 'couple',
  someday: false,
  hat: 'pip',
  settleOn: null,
  votes: [],
  rsvps: [],
  checkins: [],
  sproutedAt: 1,
});

/** The phone is in London for every case here. */
const PHONE = 'Europe/London';

describe('a plan in the calendar', () => {
  it('starts at the farm’s 4pm on the day the clocks go back', () => {
    // 25 October 2026: London leaves summer time at 02:00, so 4pm is 16:00 UTC, not 15:00.
    const times = calendarTimes(
      seed([{ date: '2026-10-25', from: '16:00' }]),
      '2026-10-25',
      'Europe/London',
      PHONE,
    );
    expect(times.allDay).toBe(false);
    expect(times.start.toISOString()).toBe('2026-10-25T16:00:00.000Z');
    expect(times.end.toISOString()).toBe('2026-10-25T18:00:00.000Z');
  });

  it('starts at the farm’s time for a farm in another zone', () => {
    const times = calendarTimes(
      seed([{ date: '2026-10-24', from: '16:00' }]),
      '2026-10-24',
      'Asia/Ho_Chi_Minh',
      PHONE,
    );
    expect(times.start.toISOString()).toBe('2026-10-24T09:00:00.000Z');
  });

  it('puts an all-day plan on the phone’s own day, from its midnight', () => {
    const times = calendarTimes(
      seed([{ date: '2026-10-24' }]),
      '2026-10-24',
      'Asia/Ho_Chi_Minh',
      PHONE,
    );
    expect(times.allDay).toBe(true);
    // Midnight in London (summer time), not in Ho Chi Minh City.
    expect(times.start.toISOString()).toBe('2026-10-23T23:00:00.000Z');
    // Until the next midnight there; London's clocks go back later that night.
    expect(times.end.toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });
});
