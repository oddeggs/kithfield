import { motion, travel, travelWobble, type SpringConfig } from '@kithfield/theme';

/*
 * The shapes travelling art follows, as plain numbers so the UI thread can read them: a box on
 * the window, a curved path between two boxes, the tilt along it and the settle on landing. Every
 * function here is a worklet and has no state.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in window points. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A cubic curve from `p0` to `p3`, the centres of the two boxes. */
export interface Path {
  readonly p0: Point;
  readonly p1: Point;
  readonly p2: Point;
  readonly p3: Point;
}

export function centreOf(box: Box): Point {
  'worklet';
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const distance = (a: Point, b: Point) => {
  'worklet';
  return Math.hypot(b.x - a.x, b.y - a.y);
};

/** How high a path rises above its higher end when the caller doesn't say: a quarter of its length. */
export function defaultArc(from: Point, to: Point): number {
  'worklet';
  return Math.min(160, Math.max(40, distance(from, to) * 0.25));
}

/**
 * A curve that lifts off `from`, rises `arc` points above the higher of its two ends, and comes
 * down onto `to`. A negative `arc` dips below the lower end instead. With `loop` (0 to 1) its
 * inner points cross, so it runs on ahead, swings back and comes round again: a loop on its way.
 */
export function arcPath(
  from: Point,
  to: Point,
  arc: number = defaultArc(from, to),
  loop = 0,
): Path {
  'worklet';
  const dx = to.x - from.x;
  // A cubic whose two inner points share a height peaks three quarters of the way to them.
  const top = arc >= 0 ? Math.min(from.y, to.y) - arc : Math.max(from.y, to.y) - arc;
  const lift = (4 / 3) * top - (from.y + to.y) / 6;
  const k = Math.min(1, Math.max(0, loop)) * 1.8;
  return {
    p0: from,
    p1: { x: from.x + dx * (0.2 + k), y: lift },
    p2: { x: from.x + dx * (0.8 - k), y: lift },
    p3: to,
  };
}

export function pointAt(path: Path, t: number): Point {
  'worklet';
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * path.p0.x + b * path.p1.x + c * path.p2.x + d * path.p3.x,
    y: a * path.p0.y + b * path.p1.y + c * path.p2.y + d * path.p3.y,
  };
}

/** The path's first derivative at `t` (points per unit of progress). */
export function tangentAt(path: Path, t: number): Point {
  'worklet';
  const u = 1 - t;
  const { p0, p1, p2, p3 } = path;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/**
 * The sprite's tilt in degrees at progress `t`, on the storyboard's own wobble (`travelWobble`):
 * one way, then the other, as it flies. Read at the display rate; only the drawings step on twos.
 */
export function wobbleAt(t: number): number {
  'worklet';
  const keys = travelWobble;
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (!a || !b) continue;
    if (clamped <= b[0]) {
      const u = (clamped - a[0]) / Math.max(1e-6, b[0] - a[0]);
      // Eased between keys, as the sample's keyframes ease.
      const e = u * u * (3 - 2 * u);
      return a[1] + (b[1] - a[1]) * e;
    }
  }
  return keys[keys.length - 1]?.[1] ?? 0;
}

/** Which drawing of the flight shows after `ms`: a new one every `travel.drawingSwapMs` (on twos). */
export function drawingAt(ms: number): number {
  'worklet';
  return Math.max(0, Math.floor(ms / travel.drawingSwapMs));
}

/**
 * The landing settle, `ms` after touching down: one drawing squashed by `travel.landingSquash`
 * (wider and lower, feet kept on the ground), then rest. Null once it has settled.
 */
export function settleAt(ms: number): { readonly sx: number; readonly sy: number } | null {
  'worklet';
  const drawing = drawingAt(ms);
  if (drawing === 0) return { sx: 1 + travel.landingSquash / 2, sy: 1 - travel.landingSquash };
  if (drawing === 1) return { sx: 1, sy: 1 };
  return null;
}

/** How long the settle takes: two drawings. */
export const SETTLE_MS = travel.drawingSwapMs * 2;

/** Scale along the flight: from the source's to the target's, swelling by `grow` at the top. */
export function scaleAt(from: number, to: number, grow: number, t: number): number {
  'worklet';
  const clamped = Math.min(1, Math.max(0, t));
  return (from + (to - from) * clamped) * (1 + grow * Math.sin(Math.PI * clamped));
}

/**
 * A new path from where a sprite is now, keeping the way it is moving, to `to`: retargeting
 * mid-flight keeps its place and its speed. `velocity` is in points a second; `seconds` is about
 * how long the new path takes. `rate` is the progress a second to start it with, so the sprite
 * leaves at the speed it had.
 */
export function retargetPath(
  at: Point,
  velocity: Point,
  to: Point,
  seconds: number,
  arc: number = defaultArc(at, to) / 2,
): { readonly path: Path; readonly rate: number } {
  'worklet';
  const speed = Math.hypot(velocity.x, velocity.y);
  // The first inner point lies along the way it moves; the path leaves at 3× that distance per
  // unit of progress, so the starting rate turns that back into the speed it had.
  const reach = Math.min(distance(at, to) / 2, (speed * seconds) / 3);
  const moving = speed > 1e-3 && reach > 1e-3;
  const p1 = moving
    ? { x: at.x + (velocity.x / speed) * reach, y: at.y + (velocity.y / speed) * reach }
    : at;
  return {
    path: { p0: at, p1, p2: { x: to.x, y: Math.min(at.y, to.y) - arc }, p3: to },
    rate: moving ? speed / (3 * reach) : 0,
  };
}

/**
 * A spring with the sheet's damping (`motion.sheet.dampingFraction`) that comes to rest, within
 * 1% of the way, in `ms`: the storyboards give each travel a time, and every travel is a spring.
 * Its response is the sheet's own (0.32 s) when `ms` is the time that spring takes.
 */
export function springSettling(ms: number): SpringConfig {
  'worklet';
  const zeta = motion.sheet.dampingFraction;
  // The envelope of an underdamped spring: e^(-ζωt) / √(1 - ζ²), down to 1% at `ms`.
  const reach = Math.log(100 / Math.sqrt(1 - zeta * zeta));
  const omega = reach / (zeta * (ms / 1000));
  return { mass: 1, stiffness: omega * omega, damping: 2 * zeta * omega };
}

/** How long the sheet spring (`motion.sheet`) takes to settle within 1%, in milliseconds. */
export const SHEET_SETTLE_MS = (() => {
  const zeta = motion.sheet.dampingFraction;
  const omega = (2 * Math.PI) / motion.sheet.response;
  return (Math.log(100 / Math.sqrt(1 - zeta * zeta)) / (zeta * omega)) * 1000;
})();
