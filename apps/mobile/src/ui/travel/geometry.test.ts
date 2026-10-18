import { describe, expect, it } from '@jest/globals';
import { springs, travel, travelWobble } from '@kithfield/theme';

import {
  arcPath,
  drawingAt,
  pointAt,
  retargetPath,
  scaleAt,
  settleAt,
  SETTLE_MS,
  SHEET_SETTLE_MS,
  springSettling,
  tangentAt,
  wobbleAt,
} from './geometry';
import { PHASE, poseAt, type FlightGeom } from './pose';

const from = { x: 37, y: 319 };
const to = { x: 192, y: 258 };

/** Steps a spring from 0 toward 1 and answers where it is after each millisecond. */
function springTrace(config: { mass: number; stiffness: number; damping: number }, ms: number) {
  let x = 0;
  let v = 0;
  const dt = 1 / 10000;
  const out: number[] = [];
  for (let step = 0; step <= ms * 10; step++) {
    if (step % 10 === 0) out.push(x);
    const a = (-config.stiffness * (x - 1) - config.damping * v) / config.mass;
    v += a * dt;
    x += v * dt;
  }
  return out;
}

describe('the path travelling art follows', () => {
  it('leaves from the source and lands on the target', () => {
    const path = arcPath(from, to, 80);
    expect(pointAt(path, 0)).toEqual(from);
    expect(pointAt(path, 1)).toEqual(to);
  });

  it('rises the asked height above its higher end at the middle', () => {
    const path = arcPath(from, to, 80);
    expect(pointAt(path, 0.5).y).toBeCloseTo(Math.min(from.y, to.y) - 80, 6);
    expect(pointAt(arcPath(from, to, -40), 0.5).y).toBeCloseTo(Math.max(from.y, to.y) + 40, 6);
  });

  it('tilts on the storyboard’s wobble, one way then the other, upright as it leaves', () => {
    expect(wobbleAt(0)).toBe(0);
    for (const [t, deg] of travelWobble) expect(wobbleAt(t)).toBeCloseTo(deg, 6);
    // Between keys it eases, never past either.
    const mid = wobbleAt((travelWobble[1]![0] + travelWobble[2]![0]) / 2);
    expect(mid).toBeGreaterThan(travelWobble[1]![1]);
    expect(mid).toBeLessThan(travelWobble[2]![1]);
    expect(wobbleAt(2)).toBe(travelWobble[travelWobble.length - 1]![1]);
  });

  it('draws a loop when asked: it runs ahead, swings back, and comes round again', () => {
    const path = arcPath(from, to, 80, 1);
    expect(pointAt(path, 0)).toEqual(from);
    expect(pointAt(path, 1)).toEqual(to);
    const xs = Array.from({ length: 41 }, (_, i) => pointAt(path, i / 40).x);
    const turns = xs
      .slice(1)
      .filter((x, i) => Math.sign(x - xs[i]!) !== Math.sign(xs[1]! - xs[0]!));
    expect(turns.length).toBeGreaterThan(0);
    // Without a loop it only ever moves toward the target.
    const plain = Array.from({ length: 41 }, (_, i) => pointAt(arcPath(from, to, 80), i / 40).x);
    expect(plain.every((x, i) => i === 0 || x >= plain[i - 1]!)).toBe(true);
  });

  it('swaps drawings on twos', () => {
    expect(drawingAt(0)).toBe(0);
    expect(drawingAt(travel.drawingSwapMs - 1)).toBe(0);
    expect(drawingAt(travel.drawingSwapMs)).toBe(1);
    expect(drawingAt(travel.drawingSwapMs * 5 + 2)).toBe(5);
  });

  it('settles on landing in two drawings: a squash, then rest', () => {
    expect(settleAt(0)).toEqual({ sx: 1 + travel.landingSquash / 2, sy: 1 - travel.landingSquash });
    expect(settleAt(travel.drawingSwapMs)).toEqual({ sx: 1, sy: 1 });
    expect(settleAt(travel.drawingSwapMs * 2)).toBeNull();
  });

  it('grows from the source’s size to the target’s, swelling at the top', () => {
    expect(scaleAt(0.5, 2, 0.3, 0)).toBe(0.5);
    expect(scaleAt(0.5, 2, 0.3, 1)).toBeCloseTo(2, 9);
    expect(scaleAt(0.5, 2, 0.3, 0.5)).toBeCloseTo(1.25 * 1.3, 9);
  });
});

describe('retargeting mid-flight', () => {
  it('keeps the place and the speed the sprite had', () => {
    const at = { x: 120, y: 180 };
    const velocity = { x: 300, y: -150 };
    const { path, rate } = retargetPath(at, velocity, { x: 300, y: 600 }, 0.48);
    expect(pointAt(path, 0)).toEqual(at);
    const d = tangentAt(path, 0);
    expect(d.x * rate).toBeCloseTo(velocity.x, 6);
    expect(d.y * rate).toBeCloseTo(velocity.y, 6);
  });

  it('starts from rest when the sprite was still', () => {
    const { path, rate } = retargetPath({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, 0.5);
    expect(rate).toBe(0);
    expect(pointAt(path, 1)).toEqual({ x: 100, y: 0 });
  });
});

describe('the spring every travel runs on', () => {
  it('is the sheet spring when given the time the sheet spring takes', () => {
    const fitted = springSettling(SHEET_SETTLE_MS);
    expect(fitted.stiffness).toBeCloseTo(springs.sheet.stiffness, 6);
    expect(fitted.damping).toBeCloseTo(springs.sheet.damping, 6);
  });

  it('comes to rest in the storyboard’s time, and not long before', () => {
    for (const ms of [380, 480, 1200]) {
      const trace = springTrace(springSettling(ms), ms);
      expect(Math.abs(1 - (trace[ms] ?? 0))).toBeLessThan(0.01);
      expect(Math.abs(1 - (trace[Math.round(ms / 3)] ?? 1))).toBeGreaterThan(0.05);
    }
  });
});

describe('the sprite along a flight', () => {
  const geom: FlightGeom = {
    phase: PHASE.flying,
    path: arcPath(from, to, 80),
    s0: 0.5,
    s1: 2,
    grow: 0,
    toBox: { x: 150, y: 200, width: 84, height: 116 },
    landedAt: 0,
    hid: true,
    holdMs: 0,
  };

  it('shows nothing before it is measured or once it has handed over', () => {
    expect(poseAt({ ...geom, phase: PHASE.waiting }, 0, 0, false, 1).opacity).toBe(0);
    expect(poseAt({ ...geom, phase: PHASE.landed }, 1, 900, false, 1).opacity).toBe(0);
    expect(poseAt({ ...geom, phase: PHASE.returned }, 0, 900, true, 1).becomes).toBe(0);
  });

  it('fades into what it becomes over the last stretch', () => {
    expect(poseAt(geom, 0.5, 0, true, 1)).toMatchObject({ opacity: 1, becomes: 0 });
    const late = poseAt(geom, 0.95, 0, true, 1);
    expect(late.opacity).toBeGreaterThan(0);
    expect(late.opacity).toBeLessThan(1);
    expect(late.becomes).toBeGreaterThan(late.opacity);
    expect(poseAt(geom, 1, 0, true, 1)).toMatchObject({ opacity: 0, becomes: 1 });
  });

  it('squashes the drawing that lands, keeping its size otherwise', () => {
    const landing = { ...geom, phase: PHASE.settling, landedAt: 500 };
    const own = poseAt(landing, 1, 510, false, 1);
    expect(own.sy).toBeCloseTo(2 * (1 - travel.landingSquash), 9);
    expect(own.base).toBeCloseTo(2, 9);
    const morphed = poseAt(landing, 1, 510, true, 1);
    expect(morphed.landSy).toBeCloseTo(1 - travel.landingSquash, 9);
    expect(morphed.sy).toBeCloseTo(2, 9);
  });

  it('cycles through its drawings on twos, tilting smoothly, mirrored when it flies left', () => {
    expect(poseAt(geom, 0.3, travel.drawingSwapMs * 4, false, 3).drawing).toBe(1);
    expect(poseAt(geom, 0.3, 0, false, 1).rotate).toBeCloseTo(wobbleAt(0.3), 9);
    expect(poseAt(geom, 0.31, 0, false, 1).rotate).not.toBe(poseAt(geom, 0.3, 0, false, 1).rotate);
    const leftward = { ...geom, path: arcPath(to, from, 80) };
    expect(poseAt(leftward, 0.3, 0, false, 1).rotate).toBeCloseTo(-wobbleAt(0.3), 9);
    expect(poseAt({ ...geom, phase: PHASE.settling }, 1, 0, false, 1).rotate).toBe(0);
  });

  it('dims to a slow pulse while it holds on the target', () => {
    const holding = { ...geom, phase: PHASE.settling, landedAt: 0, holdMs: 800 };
    const a = poseAt(holding, 1, SETTLE_MS + 10, false, 1).opacity;
    const b = poseAt(holding, 1, SETTLE_MS + 800, false, 1).opacity;
    expect(a).toBeLessThan(1);
    expect(b).toBeLessThan(a);
  });
});
