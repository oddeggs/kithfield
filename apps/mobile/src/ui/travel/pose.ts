import { centreOf, drawingAt, pointAt, scaleAt, settleAt, SETTLE_MS, wobbleAt } from './geometry';
import type { Box, Path } from './geometry';

/** Where a flight is in its life. */
export const PHASE = {
  /** Mounted, not measured yet. */
  waiting: 0,
  /** In the air, toward the target (or held by a finger). */
  flying: 1,
  /** Touched down: the two-drawing settle, then any hold on the target. */
  settling: 2,
  /** Landed and handed over to the target. */
  landed: 3,
  /** Back where it started (or cancelled) and handed back to the source. */
  returned: 4,
} as const;

/** What a flight's worklets keep between frames. */
export interface FlightGeom {
  readonly phase: number;
  readonly path: Path;
  /** Scale at the source and at the target, and the swell at the top of the arc. */
  readonly s0: number;
  readonly s1: number;
  readonly grow: number;
  /** Where the flight lands, for what it becomes there. */
  readonly toBox: Box | null;
  /** Clock time it touched down, in ms. */
  readonly landedAt: number;
  /** Whether this flight has hidden the ends' own drawings (a frame after its copy shows). */
  readonly hid: boolean;
  /** How long it stays on the target after settling, dimmed to a slow pulse, before handing over. */
  readonly holdMs: number;
  /** Hops along the way (a critter walking, a parcel bouncing down a path), and how high. */
  readonly hops: number;
  readonly hopHeight: number;
  /** It fades out along the way (a ripple spreading), in (a sprout), or neither. */
  readonly fade: number;
}

/** How a flight's opacity runs along it. */
export const FADE = { none: 0, out: 1, in: 2 } as const;

export interface SpritePose {
  readonly x: number;
  readonly y: number;
  /** Degrees. */
  readonly rotate: number;
  readonly sx: number;
  readonly sy: number;
  /** The scale before any landing squash, so a squash can keep the feet where they are. */
  readonly base: number;
  /** The settle of what it becomes, which lands instead of the travelling drawing. */
  readonly landSx: number;
  readonly landSy: number;
  /** The travelling drawing's opacity, and what it becomes (drawn still on the target). */
  readonly opacity: number;
  readonly becomes: number;
  /** Which of the sprite's drawings shows. */
  readonly drawing: number;
}

const ramp = (t: number, from: number, to: number) => {
  'worklet';
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
};

/** A slow pulse while it waits on the target: dimmed, breathing every 1.6 s. */
const PULSE_MS = 1600;

/**
 * The sprite at progress `p` and clock `ms`: on its path, tilting on the storyboard's wobble at
 * the display rate while its drawings swap on twos, settling in two drawings on landing. With
 * something to become, it fades into that drawing over the last stretch, so the face that left
 * lands as the whole critter. Held on the target, it dims to a slow pulse.
 */
export function poseAt(
  geom: FlightGeom,
  p: number,
  ms: number,
  morph: boolean,
  drawings: number,
): SpritePose {
  'worklet';
  const along = pointAt(geom.path, p);
  const clamped = Math.min(1, Math.max(0, p));
  // Each hop lifts it off the path and sets it down again.
  const hop = geom.hops > 0 ? Math.abs(Math.sin(Math.PI * geom.hops * clamped)) : 0;
  const at = { x: along.x, y: along.y - geom.hopHeight * hop };
  const fading =
    geom.fade === FADE.out ? 1 - clamped : geom.fade === FADE.in ? Math.min(1, clamped * 2) : 1;
  const scale = scaleAt(geom.s0, geom.s1, geom.grow, p);
  const since = ms - geom.landedAt;
  const settle = geom.phase === PHASE.settling ? settleAt(since) : null;
  const sx = settle?.sx ?? 1;
  const sy = settle?.sy ?? 1;
  const flying = geom.phase === PHASE.flying;
  // Before it is measured, and once the target or source has its drawing back, nothing shows.
  const gone =
    geom.phase === PHASE.waiting || geom.phase === PHASE.landed || geom.phase === PHASE.returned;
  const holding = geom.phase === PHASE.settling && since >= SETTLE_MS;
  const pulse = holding ? 0.7 + 0.2 * Math.cos((2 * Math.PI * (since - SETTLE_MS)) / PULSE_MS) : 1;
  const leftward = geom.path.p3.x < geom.path.p0.x ? -1 : 1;
  const opacity = (morph ? 1 - ramp(p, 0.85, 1) : 1) * pulse * fading;
  return {
    x: at.x,
    y: at.y,
    rotate: flying ? wobbleAt(p) * leftward : 0,
    sx: morph ? scale : scale * sx,
    sy: morph ? scale : scale * sy,
    base: scale,
    landSx: morph ? sx : 1,
    landSy: morph ? sy : 1,
    opacity: gone ? 0 : opacity,
    becomes: morph && !gone ? ramp(p, 0.8, 1) : 0,
    drawing: drawings > 1 ? drawingAt(ms) % drawings : 0,
  };
}

/** Where what the sprite becomes stands: centred on the target. */
export function landingCentre(geom: FlightGeom) {
  'worklet';
  return geom.toBox ? centreOf(geom.toBox) : geom.path.p3;
}
