import { describe, expect, it } from '@jest/globals';

import { SOCKET_BACKOFF, backoffDelay } from './backoff';

describe('reconnect back-off', () => {
  it('doubles from the base up to the cap, jittered within the upper half', () => {
    const low = (attempt: number) => backoffDelay(attempt, SOCKET_BACKOFF, () => 0);
    const high = (attempt: number) => backoffDelay(attempt, SOCKET_BACKOFF, () => 0.999_999);
    expect([1, 2, 3, 4].map(low)).toEqual([250, 500, 1000, 2000]);
    expect([1, 2, 3, 4].map(high)).toEqual([500, 1000, 2000, 4000]);
    expect(low(20)).toBe(15_000);
    expect(high(20)).toBe(30_000);
  });

  it('spreads phones out instead of bringing them back at once', () => {
    const delays = new Set(Array.from({ length: 50 }, () => backoffDelay(5, SOCKET_BACKOFF)));
    expect(delays.size).toBeGreaterThan(10);
  });
});
