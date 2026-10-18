import { describe, expect, it } from 'vitest';

import { nextLocalHour, zonedInstant } from '../../src/farm/calendar';
import { matchOf } from '../../src/farm/history';

describe('wall-clock times', () => {
  it('turn a local time into an instant, through daylight saving changes', () => {
    expect(zonedInstant('2026-10-24', 9, 'Europe/London')).toBe(Date.UTC(2026, 9, 24, 8));
    expect(zonedInstant('2026-10-25', 9, 'Europe/London')).toBe(Date.UTC(2026, 9, 25, 9));
    expect(zonedInstant('2026-11-29', 0, 'Australia/Sydney')).toBe(Date.UTC(2026, 10, 28, 13));
    expect(zonedInstant('2026-06-01', 0, 'Asia/Ho_Chi_Minh')).toBe(Date.UTC(2026, 4, 31, 17));
  });

  it('find the next time the clock reads an hour', () => {
    expect(nextLocalHour(Date.UTC(2026, 9, 18, 3), 5, 'Europe/London')).toBe(
      Date.UTC(2026, 9, 18, 4),
    );
    expect(nextLocalHour(Date.UTC(2026, 9, 18, 4), 5, 'Europe/London')).toBe(
      Date.UTC(2026, 9, 19, 4),
    );
  });
});

describe('search queries', () => {
  it('quote every word as a prefix, so no input is FTS syntax', () => {
    expect(matchOf('  picnic  "OR" ')).toBe('"picnic"* """OR"""*');
    expect(matchOf('   ')).toBeNull();
  });
});
