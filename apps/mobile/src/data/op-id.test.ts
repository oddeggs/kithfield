import { describe, expect, it } from '@jest/globals';
import { OpId } from '@kithfield/contracts';

import { createOpIdMaker } from './op-id';

const random = (count: number) =>
  Uint8Array.from({ length: count }, () => Math.floor(Math.random() * 256));

describe('op ids', () => {
  it('are lowercase UUIDv7s carrying the time they were made', () => {
    const next = createOpIdMaker(random, () => 1_792_000_000_000);
    const id = next();
    expect(OpId.safeParse(id).success).toBe(true);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(1_792_000_000_000);
  });

  it('sort in the order they were made, within a millisecond and when the clock steps back', () => {
    let clock = 1_792_000_000_000;
    const next = createOpIdMaker(random, () => clock);
    const ids: string[] = [];
    for (let i = 0; i < 5000; i += 1) {
      if (i === 2500) clock -= 10_000;
      ids.push(next());
    }
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => OpId.safeParse(id).success)).toBe(true);
  });
});
