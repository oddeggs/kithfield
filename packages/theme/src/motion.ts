/**
 * Motion from `design/01 Foundations.dc.html` (Motion, Notes for the developer), the curves the
 * live samples in `design/kf-motion.js` play, and the timings of the storyboards in
 * `design/18 Motion and Transitions.dc.html`. Plain numbers, so a worklet can read them:
 * durations in milliseconds, curves as `[x1, y1, x2, y2]` for `Easing.bezier(...)`, springs as
 * `{ mass, stiffness, damping }` for `withSpring`.
 */

export type Bezier = readonly [number, number, number, number];

export interface SpringConfig {
  mass: number;
  stiffness: number;
  damping: number;
}

/**
 * A spring given as SwiftUI's `response` (seconds) and `dampingFraction`, as physical constants
 * for unit mass: stiffness (2π / response)², damping 2 · dampingFraction · 2π / response.
 */
export function springFromResponse(response: number, dampingFraction: number): SpringConfig {
  'worklet';
  const omega = (2 * Math.PI) / response;
  return { mass: 1, stiffness: omega * omega, damping: 2 * dampingFraction * omega };
}

/** The shared motion names every file's developer notes refer to. */
export const motion = {
  /** Spring · sheets, cards, menus, and every travelling element (driven by a target). */
  sheet: { response: 0.32, dampingFraction: 0.9 },
  /** Ease-out · fades, Reduce Motion swaps. */
  fade: { durationMs: 200, bezier: [0.2, 0.8, 0.2, 1] as Bezier },
  /** Linear cross-fade · search results, swaps. */
  cross: { durationMs: 120, bezier: [0, 0, 1, 1] as Bezier },
  /** Held frames: each drawing held 2 frames at 24, so 12 drawings a second (critters, fire, rain, stickers). */
  twos: { fps: 12, holdFrames: 2, baseFps: 24, frameMs: 1000 / 12 },
  /** Sine breathing of critters: one period awake, a slower one asleep. */
  breath: { awakeMs: 3100, asleepMs: 4400 },
  /** Ease-in-out · the farm drawing in. Control points as the Foundations curve draws them. */
  reveal: { durationMs: 4200, bezier: [0.45, 0, 0.55, 1] as Bezier },
} as const;

export type MotionName = keyof typeof motion;

/** `motion.sheet` for `withSpring`. */
export const springs = {
  sheet: springFromResponse(motion.sheet.response, motion.sheet.dampingFraction),
} as const satisfies Record<string, SpringConfig>;

/**
 * The curves the web samples use. `spring` is their timeline stand-in for `motion.sheet` where a
 * keyframed animation cannot run a spring; native code uses `springs.sheet`. The fire storyboard
 * has two curves of its own.
 */
export const sampleCurves = {
  spring: [0.3, 1.12, 0.4, 1],
  easeOut: [0.2, 0.8, 0.2, 1],
  linear: [0, 0, 1, 1],
  /** The farm accelerating into the fire ring. */
  fireZoom: [0.5, 0, 0.8, 0.4],
  /** The fire room lifting into the Dynamic Island. */
  fireToIsland: [0.5, 0, 0.3, 1],
} as const satisfies Record<string, Bezier>;

/**
 * Reduce Motion, from Foundations and the storyboards: art holds still (no twos, no breathing,
 * travelling art does not move) and every UI move or transition becomes `motion.fade`.
 */
export const reduceMotion = {
  /** What a transition collapses to: a cross-fade from the first frame to the last. */
  transition: 'fade',
  artStill: true,
} as const;

/** The motion to run for `name`, or null where Reduce Motion holds the art still. */
export function motionFor(name: MotionName, reduce: boolean): MotionName | null {
  'worklet';
  if (!reduce) return name;
  if (name === 'twos' || name === 'breath') return null;
  return reduceMotion.transition;
}

/** Signature motion: the drawing inside a flying sprite swaps on twos while its path is smooth. */
export const travel = {
  /** Sprites rotate this far each way along the path's curvature, in degrees. */
  wobbleMinDeg: 3,
  wobbleMaxDeg: 8,
  /** A different drawing every 83 ms, on twos. */
  drawingSwapMs: 83,
  /** Landing settles over two drawings: a 4% squash, then rest. */
  landingSquash: 0.04,
} as const;

/**
 * The travelling face's tilt in sample 01 of `design/kf-motion.js`, as `[progress, degrees]` from
 * leaving (0) to landing (1): it leans one way, then the other, settling as it lands. Every
 * travelling sprite tilts on this curve, mirrored when it flies leftward.
 */
export const travelWobble: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.273, -6],
  [0.545, 8],
  [0.818, -5],
  [1, 3],
];
