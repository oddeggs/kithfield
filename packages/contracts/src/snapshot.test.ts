import { describe, expect, it } from 'vitest';

import { LIMITS } from './primitives';
import { at, farmState, visitState } from './samples.test-data';
import { FarmState, Snapshot } from './snapshot';

const roundTrip = (value: unknown) => {
  const parsed = Snapshot.parse(value);
  expect(parsed).toEqual(value);
  expect(Snapshot.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
};

describe('snapshot', () => {
  it('round-trips a farm and a visit unchanged', () => {
    roundTrip({ seq: 412, state: farmState });
    roundTrip({ seq: 9, state: visitState });
  });

  it('rejects states that break the house rules or the limits', () => {
    const tooMany = Array.from({ length: LIMITS.members + 1 }, (_, i) => ({
      ...farmState.members[0],
      person: `p_${i}`,
    }));
    const broken: unknown[] = [
      { ...farmState, members: tooMany },
      { ...farmState, pins: Array.from({ length: LIMITS.pins + 1 }, (_, i) => i + 1) },
      { ...farmState, plants: [{ ...farmState.plants[0], stage: 5 }] },
      { ...farmState, plants: [{ ...farmState.plants[0], dew: -1 }] },
      { ...farmState, plants: [{ ...farmState.plants[0], rare: 'moon_glow' }] },
      { ...farmState, name: '' },
      { ...farmState, familyTendedAt: { dew: at } },
      {
        ...farmState,
        today: { day: '2026-10-18', given: [{ person: 'p_x', plant: 'aster', dew: 4 }] },
      },
      { ...farmState, season: { season: 'autumn', year: 2025 } },
      {
        ...farmState,
        members: [{ ...farmState.members[0], status: { text: 'x'.repeat(41), at } }],
      },
    ];
    for (const state of broken) expect(FarmState.safeParse(state).success).toBe(false);
    expect(Snapshot.safeParse({ seq: 0, state: farmState }).success).toBe(false);
  });

  it('carries no streaks, care counts or read receipts', () => {
    const names = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return (node as unknown[]).forEach(walk);
      if (typeof node !== 'object' || node === null) return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === 'properties' && typeof value === 'object' && value !== null) {
          Object.keys(value).forEach((name) => names.add(name));
        }
        walk(value);
      }
    };
    walk(FarmState.toJSONSchema());
    expect(names.size).toBeGreaterThan(40);
    for (const name of names) {
      expect(name, name).not.toMatch(/streak|receipt|counts?$|total|tally|^(read|seen)(At|By)$/i);
    }
  });
});
