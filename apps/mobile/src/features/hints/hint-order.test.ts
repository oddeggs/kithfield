import { describe, expect, it } from '@jest/globals';

import { HINTS, afterOk, isDue, seenFrom } from './hint-order';

describe('first-run tips', () => {
  it('shows one tip at a time, in order', () => {
    expect(isDue(0, 'critter')).toBe(true);
    expect(isDue(0, 'message')).toBe(false);
    expect(isDue(0, 'seed')).toBe(false);
    expect(isDue(1, 'message')).toBe(true);
    expect(isDue(2, 'seed')).toBe(true);
  });

  it('never shows a tip again once it is put away', () => {
    let seen = 0;
    seen = afterOk(seen, 'critter');
    expect(isDue(seen, 'critter')).toBe(false);
    // Putting away a tip that isn't due moves nothing on.
    expect(afterOk(seen, 'seed')).toBe(seen);
    seen = afterOk(seen, 'message');
    seen = afterOk(seen, 'seed');
    expect(HINTS.some((h) => isDue(seen, h))).toBe(false);
  });

  it('reads a fresh phone as no tips seen, and anything odd as all seen', () => {
    expect(seenFrom(null)).toBe(0);
    expect(seenFrom('2')).toBe(2);
    expect(seenFrom('9')).toBe(HINTS.length);
    expect(seenFrom('soon')).toBe(HINTS.length);
    expect(seenFrom('-1')).toBe(HINTS.length);
  });
});
