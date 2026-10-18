import { describe, expect, it } from '@jest/globals';

import { createSelection } from './selection';

describe('selections', () => {
  it('reruns the selector only for a new snapshot, and keeps an equal result', () => {
    let runs = 0;
    const pick = (s: { pins: number[]; seq: number }) => {
      runs += 1;
      return s.pins;
    };
    const select = createSelection<{ pins: number[]; seq: number }, number[]>(
      (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
    );
    const first = { pins: [3], seq: 1 };
    const a = select(first, pick);
    expect(select(first, pick)).toBe(a);
    expect(runs).toBe(1);

    // A new snapshot with the same pins: the selector runs, the old value stays.
    expect(select({ pins: [3], seq: 2 }, pick)).toBe(a);
    expect(runs).toBe(2);
    expect(select({ pins: [3, 4], seq: 3 }, pick)).toEqual([3, 4]);
  });
});
