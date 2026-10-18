import type { View } from 'react-native';
import {
  measure,
  withDelay,
  withSpring,
  ReduceMotion,
  type AnimatedRef,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  arcPath,
  centreOf,
  defaultArc,
  pointAt,
  retargetPath,
  SETTLE_MS,
  springSettling,
  tangentAt,
  type Box,
} from './geometry';
import { heldTilt, PHASE, type FlightGeom } from './pose';

/*
 * One flight on the UI thread: measuring its two ends, the spring that carries it, following a
 * target that moves or arrives late, landing and handing back. Everything here is a worklet;
 * the JS side only starts it and sends it new orders.
 */

/** A flight's state on the UI thread. */
export interface FlightValues {
  /** Whether the ends' own drawings hide while the copy flies. */
  readonly hides: { readonly source: boolean; readonly target: boolean };
  /** Progress along the path: 0 at the source, 1 at the target. Driven by a spring or a finger. */
  readonly p: SharedValue<number>;
  readonly geom: SharedValue<FlightGeom>;
  /** Milliseconds since the flight started, from the frame clock. */
  readonly clock: SharedValue<number>;
  /** Where the spring is heading: 1 to the target, 0 back to the source. */
  readonly goal: SharedValue<number>;
  /** Progress per second, measured frame to frame, so a new order keeps the speed. */
  readonly rate: SharedValue<number>;
  /** 1 while a finger drives the progress. */
  readonly driven: SharedValue<number>;
  /** The source's and target's own drawings: hidden while their copy flies. */
  readonly fromShown: SharedValue<number> | null;
  readonly toShown: SharedValue<number> | null;
}

/** What a flight needs to start, made on the JS side. */
export interface FlightPlan {
  readonly fromRef: AnimatedRef<View> | null;
  readonly fromBox: Box | null;
  readonly toRef: AnimatedRef<View> | null;
  readonly toBox: Box | null;
  /** Width of the sprite as drawn, so its scale fits each end. */
  readonly spriteWidth: number;
  /** The share of the source's width it leaves at, and of the target's it lands at. */
  readonly startFit: number;
  readonly fit: number;
  /** Its width at each end, in points, where the caller fixes it instead. */
  readonly fromWidth: number | null;
  readonly toWidth: number | null;
  readonly arc: number | null;
  readonly grow: number;
  readonly outMs: number;
  readonly delayMs: number;
}

export function measureBox(ref: AnimatedRef<View> | null): Box | null {
  'worklet';
  if (ref === null) return null;
  const m = measure(ref);
  if (m === null || (m.width === 0 && m.height === 0)) return null;
  return { x: m.pageX, y: m.pageY, width: m.width, height: m.height };
}

/** The sprite's scale on `to`: a fixed width, or a share of the target's. */
export function landingScale(to: Box, spriteWidth: number, fit: number, width: number | null) {
  'worklet';
  return (width ?? to.width * fit) / spriteWidth;
}

const springTo = (goal: number, ms: number, velocity: number) => {
  'worklet';
  return withSpring(goal, {
    ...springSettling(ms),
    velocity,
    reduceMotion: ReduceMotion.Never,
  });
};

/** Starts a measured flight; answers false when the source can't be found to leave from. */
export function startFlight(v: FlightValues, plan: FlightPlan): boolean {
  'worklet';
  const from = measureBox(plan.fromRef) ?? plan.fromBox;
  if (from === null) return false;
  // A target not on screen yet: it rises toward where it will be and is retargeted on arrival.
  const to = measureBox(plan.toRef) ??
    plan.toBox ?? {
      x: from.x,
      y: from.y - 120,
      width: from.width,
      height: from.height,
    };
  const a = centreOf(from);
  const b = centreOf(to);
  v.geom.set({
    phase: PHASE.flying,
    path: arcPath(a, b, plan.arc ?? defaultArc(a, b)),
    s0: (plan.fromWidth ?? from.width * plan.startFit) / plan.spriteWidth,
    s1: landingScale(to, plan.spriteWidth, plan.fit, plan.toWidth),
    grow: plan.grow,
    toBox: to,
    landedAt: 0,
    hid: false,
    step: -1,
    tilt: 0,
  });
  v.goal.set(1);
  if (v.driven.get() === 0) {
    v.p.set(withDelay(plan.delayMs, springTo(1, plan.outMs, 0)));
  }
  return true;
}

/**
 * Turns the flight toward `to` from wherever it is, keeping its place and speed: the same spring,
 * now with a new end.
 */
export function retargetFlight(
  v: FlightValues,
  to: Box,
  size: { readonly spriteWidth: number; readonly fit: number; readonly toWidth: number | null },
  ms: number,
) {
  'worklet';
  const g = v.geom.get();
  if (g.phase !== PHASE.flying) return;
  const p = v.p.get();
  const at = pointAt(g.path, p);
  const d = tangentAt(g.path, p);
  const rate = v.rate.get();
  const velocity = { x: d.x * rate, y: d.y * rate };
  const scale = g.s0 + (g.s1 - g.s0) * Math.min(1, Math.max(0, p));
  const next = retargetPath(at, velocity, centreOf(to), ms / 1000);
  v.geom.set({
    ...g,
    path: next.path,
    s0: scale,
    s1: landingScale(to, size.spriteWidth, size.fit, size.toWidth),
    grow: 0,
    toBox: to,
  });
  v.goal.set(1);
  v.p.set(0);
  if (v.driven.get() === 0) v.p.set(springTo(1, ms, next.rate));
}

/** Sends the flight back to its source along the same path, with the speed it has. */
export function reverseFlight(v: FlightValues, ms: number) {
  'worklet';
  const g = v.geom.get();
  if (g.phase !== PHASE.flying) return;
  v.goal.set(0);
  v.driven.set(0);
  v.p.set(springTo(0, ms, v.rate.get()));
}

/** A finger lets go: on to the target or back to the source, carrying the finger's speed. */
export function releaseFlight(
  v: FlightValues,
  forward: boolean,
  rate: number,
  outMs: number,
  backMs: number,
) {
  'worklet';
  if (v.geom.get().phase !== PHASE.flying) return;
  v.driven.set(0);
  v.goal.set(forward ? 1 : 0);
  v.p.set(springTo(forward ? 1 : 0, forward ? outMs : backMs, rate));
}

/** Skips to the landing. */
export function finishFlight(v: FlightValues) {
  'worklet';
  if (v.geom.get().phase !== PHASE.flying) return;
  v.driven.set(0);
  v.goal.set(1);
  v.p.set(1);
}

/** Moves closer than this to the target count as it shifting, not as a new target. */
const NUDGE = 24;

/**
 * One frame of a flight: follows the finger or the spring, keeps up with a target that moves or
 * arrives, holds the tilt for each drawing on twos, and lands or returns.
 */
export function stepFlight(
  v: FlightValues,
  dt: number,
  ends: {
    readonly toRef: AnimatedRef<View> | null;
    readonly drive: DerivedValue<number> | null;
    readonly spriteWidth: number;
    readonly fit: number;
    readonly toWidth: number | null;
    readonly outMs: number;
  },
  done: (how: 'touchdown' | 'landed' | 'returned') => void,
) {
  'worklet';
  const g = v.geom.get();
  if (g.phase !== PHASE.flying && g.phase !== PHASE.settling) return;
  // The flight's own clock: the frame callback restarts when its target arrives late.
  const ms = v.clock.get() + dt;
  v.clock.set(ms);
  // The copy has been drawn once: now the originals can go without a frame of neither.
  if (!g.hid) {
    if (v.hides.source) v.fromShown?.set(0);
    if (v.hides.target) v.toShown?.set(0);
    v.geom.set({ ...g, hid: true });
    return;
  }
  if (g.phase === PHASE.settling) {
    if (ms - g.landedAt >= SETTLE_MS) {
      v.geom.set({ ...g, phase: PHASE.landed });
      v.toShown?.set(1);
      v.fromShown?.set(1);
      scheduleOnRN(done, 'landed');
    }
    return;
  }
  const before = v.p.get();
  if (v.driven.get() === 1 && ends.drive !== null) v.p.set(ends.drive.get());
  const p = v.p.get();
  if (dt > 0) v.rate.set((p - before) / (dt / 1000));

  // The target may still be arriving (a screen opening) or moving (a list scrolling).
  const box = measureBox(ends.toRef);
  const known = g.toBox;
  if (box !== null && known !== null) {
    const shift = Math.hypot(
      box.x + box.width / 2 - (known.x + known.width / 2),
      box.y + box.height / 2 - (known.y + known.height / 2),
    );
    if (shift > NUDGE && p < 0.9) {
      retargetFlight(v, box, ends, ends.outMs * (1 - Math.min(0.8, p)));
      return;
    }
    if (shift > 0.5 || Math.abs(box.width - known.width) > 0.5) {
      const end = centreOf(box);
      const dx = end.x - g.path.p3.x;
      const dy = end.y - g.path.p3.y;
      v.geom.set({
        ...g,
        path: { ...g.path, p2: { x: g.path.p2.x + dx, y: g.path.p2.y + dy }, p3: end },
        s1: landingScale(box, ends.spriteWidth, ends.fit, ends.toWidth),
        toBox: box,
      });
    }
  }

  const now = v.geom.get();
  v.geom.set(heldTilt(now, p, ms));
  if (v.driven.get() === 1) return;
  if (v.goal.get() === 1 && p >= 0.995) {
    v.geom.set({ ...v.geom.get(), phase: PHASE.settling, landedAt: ms });
    scheduleOnRN(done, 'touchdown');
  } else if (v.goal.get() === 0 && p <= 0.005) {
    v.geom.set({ ...v.geom.get(), phase: PHASE.returned });
    v.toShown?.set(1);
    v.fromShown?.set(1);
    scheduleOnRN(done, 'returned');
  }
}
