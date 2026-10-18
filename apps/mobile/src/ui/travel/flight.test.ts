import { describe, expect, it, jest } from '@jest/globals';
import type { SharedValue } from 'react-native-reanimated';

import * as flight from './flight';
import { SETTLE_MS } from './geometry';
import { PHASE, type FlightGeom } from './pose';

// (jest lifts these mocks above the imports.) Springs land at once and nothing on screen measures: the flight's own logic is what is tested.
jest.mock('react-native-reanimated', () => ({
  measure: () => null,
  withSpring: (to: number) => to,
  withDelay: (_ms: number, animation: unknown) => animation,
  ReduceMotion: { Never: 'never' },
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

const value = <T>(start: T): SharedValue<T> => {
  let current = start;
  return {
    get: () => current,
    set: (next: T | ((v: T) => T)) => {
      current = typeof next === 'function' ? (next as (v: T) => T)(current) : next;
    },
  } as unknown as SharedValue<T>;
};

const anchor = () => ({ shown: value(1), hidden: value(0) });
type Anchor = ReturnType<typeof anchor>;

const startGeom = {
  phase: PHASE.waiting,
  path: { p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, p3: { x: 0, y: 0 } },
  s0: 1,
  s1: 1,
  grow: 0,
  toBox: null,
  landedAt: 0,
  hid: false,
  holdMs: 0,
};

function makeFlight(from: Anchor | null = anchor(), driven = false) {
  return {
    p: value(0),
    geom: value<FlightGeom>(startGeom),
    clock: value(0),
    goal: value(1),
    rate: value(0),
    driven: value(driven ? 1 : 0),
    order: value<number>(flight.ORDER.none),
    orderRate: value(0),
    hides: { source: true, target: true },
    from,
  };
}

const plan = {
  fromRef: null,
  fromBox: { x: 10, y: 400, width: 30, height: 30 },
  toRef: null,
  toBox: { x: 200, y: 100, width: 60, height: 60 },
  spriteWidth: 60,
  startFit: 1,
  fit: 1,
  fromWidth: null,
  toWidth: null,
  arc: null,
  loop: 0,
  grow: 0,
  outMs: 480,
  delayMs: 0,
  holdMs: 0,
};

/** Steps the flight a frame at a time until it ends, answering what it said along the way. */
function run(v: ReturnType<typeof makeFlight>, to: Anchor | null, frames = 40) {
  const heard: string[] = [];
  const ends = { toRef: null, drive: null, spriteWidth: 60, fit: 1, toWidth: null, outMs: 480, to };
  for (let i = 0; i < frames; i++) flight.stepFlight(v, 16, ends, (how) => heard.push(how));
  return heard;
}

describe('a flight’s life', () => {
  it('hides both ends once its copy shows, lands, settles, then gives both back', () => {
    const from = anchor();
    const to = anchor();
    const v = makeFlight(from);
    expect(flight.startFlight(v, plan, to)).toBe('flying');
    flight.stepFlight(
      v,
      16,
      { toRef: null, drive: null, spriteWidth: 60, fit: 1, toWidth: null, outMs: 480, to },
      () => undefined,
    );
    expect([from.shown.get(), to.shown.get()]).toEqual([0, 0]);
    const heard = run(v, to, Math.ceil(SETTLE_MS / 16) + 4);
    expect(heard).toEqual(['touchdown', 'landed']);
    expect(v.geom.get().phase).toBe(PHASE.landed);
    const fresh = makeFlight();
    flight.startFlight(fresh, plan, null);
    expect(run(fresh, null, 1)).toEqual(['start']);
    expect([from.shown.get(), to.shown.get()]).toEqual([1, 1]);
  });

  it('returns along its path when reversed, giving both ends back', () => {
    const from = anchor();
    const to = anchor();
    const v = makeFlight(from);
    flight.startFlight(v, { ...plan, outMs: 480 }, to);
    run(v, to, 1);
    v.p.set(0.4);
    flight.reverseFlight(v, 380);
    expect(run(v, to)).toEqual(['returned']);
    expect([from.shown.get(), to.shown.get()]).toEqual([1, 1]);
  });
});

describe('orders given before the flight has started', () => {
  it('a release forward lands', () => {
    const from = anchor();
    const to = anchor();
    const v = makeFlight(from, true);
    flight.releaseFlight(v, true, 2, 480, 380);
    expect(flight.startFlight(v, plan, to)).toBe('flying');
    expect(run(v, to)).toEqual(['start', 'touchdown', 'landed']);
    expect([from.shown.get(), to.shown.get()]).toEqual([1, 1]);
  });

  it('a release back returns at once and never hides anything', () => {
    const from = anchor();
    const to = anchor();
    const v = makeFlight(from, true);
    flight.releaseFlight(v, false, -2, 480, 380);
    expect(flight.startFlight(v, plan, to)).toBe('returned');
    expect(run(v, to)).toEqual([]);
    expect([from.shown.get(), to.shown.get()]).toEqual([1, 1]);
  });

  it('a reverse returns at once, and a finish lands', () => {
    const reversed = makeFlight();
    flight.reverseFlight(reversed, 380);
    expect(flight.startFlight(reversed, plan, null)).toBe('returned');
    const finished = makeFlight();
    flight.finishFlight(finished);
    expect(flight.startFlight(finished, plan, null)).toBe('flying');
    expect(finished.p.get()).toBe(1);
    expect(run(finished, null)).toEqual(['start', 'touchdown', 'landed']);
  });

  it('a flight with no source to leave from never starts', () => {
    expect(flight.startFlight(makeFlight(), { ...plan, fromBox: null }, null)).toBe('missing');
  });
});

describe('cancelling', () => {
  it('gives both ends back from wherever it is', () => {
    const from = anchor();
    const to = anchor();
    const v = makeFlight(from);
    flight.startFlight(v, plan, to);
    run(v, to, 1);
    expect(from.shown.get()).toBe(0);
    flight.cancelFlight(v, to);
    expect([from.shown.get(), to.shown.get()]).toEqual([1, 1]);
    expect(v.geom.get().phase).toBe(PHASE.returned);
    expect(run(v, to)).toEqual([]);
  });

  it('before it starts, it never hides anything', () => {
    const from = anchor();
    const to = anchor();
    const v = makeFlight(from);
    flight.cancelFlight(v, to);
    expect(flight.startFlight(v, plan, to)).toBe('returned');
    expect([from.shown.get(), to.shown.get()]).toEqual([1, 1]);
  });
});

describe('ends shared between flights', () => {
  it('stay hidden until the last flight using them lets go', () => {
    const shared = anchor();
    const a = makeFlight(shared);
    const b = makeFlight(shared);
    flight.startFlight(a, plan, null);
    flight.startFlight(b, plan, null);
    run(a, null, 1);
    run(b, null, 1);
    flight.cancelFlight(a, null);
    expect(shared.shown.get()).toBe(0);
    flight.cancelFlight(b, null);
    expect(shared.shown.get()).toBe(1);
    expect(shared.hidden.get()).toBe(0);
  });

  it('turning to a new target shows the old one and hides the new', () => {
    const old = anchor();
    const next = anchor();
    const v = makeFlight();
    flight.startFlight(v, plan, old);
    run(v, old, 1);
    v.p.set(0.3);
    flight.swapTarget(v, old, next);
    expect([old.shown.get(), next.shown.get()]).toEqual([1, 0]);
  });
});

describe('holding at the target', () => {
  it('stays on the target for its hold before handing over', () => {
    const to = anchor();
    const v = makeFlight();
    flight.startFlight(v, { ...plan, holdMs: 800 }, to);
    const short = run(v, to, Math.ceil(SETTLE_MS / 16) + 4);
    expect(short).toEqual(['start', 'touchdown']);
    expect(to.shown.get()).toBe(0);
    expect(run(v, to, Math.ceil(800 / 16) + 2)).toEqual(['landed']);
    expect(to.shown.get()).toBe(1);
  });
});
