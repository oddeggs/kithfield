import { type FarmState, FarmState as FarmStateSchema } from '@kithfield/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildLog, history } from './arbitrary.test-data';
import { DAILY_CAP, THRESHOLDS } from './rules';
import { deepFreeze, expectSnapshot } from './farm.test-data';
import { kFor, stageFromDew, thresholdsFor } from './growth';
import { applyEvent, createFarm, reduce } from './reducer';
import { sameSeason } from './time';

/** What a device would store and read back: JSON, checked against the snapshot schema. */
const roundTrip = (state: FarmState): FarmState =>
  FarmStateSchema.parse(JSON.parse(JSON.stringify(state)));

describe('farm rules properties', () => {
  it('is deterministic and never changes its input', () => {
    fc.assert(
      fc.property(history, ({ kind, steps }) => {
        const { events } = buildLog(kind, steps);
        const [created, ...rest] = events;
        if (created?.kind !== 'farm_created') throw new Error('no farm');
        deepFreeze(events);
        const once = reduce(deepFreeze(createFarm(created)), rest);
        const twice = reduce(createFarm(created), rest);
        expect(twice).toEqual(once);
        expectSnapshot(once);
      }),
      { numRuns: 150 },
    );
  });

  it('gives the same state in any batching, and from any snapshot as from seq 1', () => {
    fc.assert(
      fc.property(history, fc.array(fc.nat(), { maxLength: 6 }), ({ kind, steps }, cuts) => {
        const { events } = buildLog(kind, steps);
        const [created, ...rest] = events;
        if (created?.kind !== 'farm_created') throw new Error('no farm');
        const whole = reduce(createFarm(created), rest);
        const points = [...new Set(cuts.map((c) => c % (rest.length + 1)))].sort((a, b) => a - b);
        let state = createFarm(created);
        let from = 0;
        for (const point of [...points, rest.length]) {
          state = roundTrip(reduce(state, rest.slice(from, point)));
          from = point;
        }
        expect(state).toEqual(whole);
      }),
      { numRuns: 150 },
    );
  });

  it('never lowers a stage within a season', () => {
    fc.assert(
      fc.property(history, ({ kind, steps }) => {
        const { events } = buildLog(kind, steps);
        const [created, ...rest] = events;
        if (created?.kind !== 'farm_created') throw new Error('no farm');
        let state = createFarm(created);
        for (const event of rest) {
          const next = applyEvent(state, event);
          if (sameSeason(next.season, state.season)) {
            for (const plant of [...state.plants, ...(state.pot ? [state.pot] : [])]) {
              const after = [...next.plants, ...(next.pot ? [next.pot] : [])].find(
                (p) => p.plant === plant.plant,
              );
              expect(after?.stage ?? -1).toBeGreaterThanOrEqual(plant.stage);
              expect(after?.dew ?? -1).toBeGreaterThanOrEqual(plant.dew);
            }
          }
          state = next;
        }
      }),
      { numRuns: 150 },
    );
  });

  it('caps every person at 3 dew per plant per farm day, and counts all dew against the cap', () => {
    fc.assert(
      fc.property(history, ({ kind, steps }) => {
        const { events } = buildLog(kind, steps);
        const [created, ...rest] = events;
        if (created?.kind !== 'farm_created') throw new Error('no farm');
        let state = createFarm(created);
        for (const event of rest) {
          const next = applyEvent(state, event);
          for (const given of next.today.given) expect(given.dew).toBeLessThanOrEqual(DAILY_CAP);
          if (sameSeason(next.season, state.season)) {
            const before = next.today.day === state.today.day ? state.today.given : [];
            const plants = [...next.plants, ...(next.pot ? [next.pot] : [])];
            for (const plant of plants) {
              const old = [...state.plants, ...(state.pot ? [state.pot] : [])].find(
                (p) => p.plant === plant.plant,
              );
              const sum = (list: typeof before) =>
                list.filter((g) => g.plant === plant.plant).reduce((n, g) => n + g.dew, 0);
              expect(plant.dew - (old?.dew ?? 0)).toBe(sum(next.today.given) - sum(before));
            }
          }
          state = next;
        }
      }),
      { numRuns: 150 },
    );
  });

  it('scales thresholds by k = max(1, √(active / 3)), rounded up, and only ever up with more people', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), fc.nat(200), (active, dew) => {
        const t = thresholdsFor(active);
        const k = kFor(active);
        for (const key of ['sprout', 'bud', 'bloom'] as const) {
          expect(t[key]).toBeGreaterThanOrEqual(THRESHOLDS[key] * k - 1e-9);
          expect(t[key] - 1).toBeLessThan(THRESHOLDS[key] * k);
          expect(t[key]).toBeGreaterThanOrEqual(thresholdsFor(Math.max(0, active - 1))[key]);
        }
        expect(stageFromDew(dew, t)).toBeLessThanOrEqual(
          stageFromDew(dew, thresholdsFor(Math.max(0, active - 1))),
        );
        expect(stageFromDew(dew + 1, t)).toBeGreaterThanOrEqual(stageFromDew(dew, t));
      }),
      { numRuns: 500 },
    );
  });
});
