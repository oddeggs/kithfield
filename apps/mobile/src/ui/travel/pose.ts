import {
  centreOf,
  drawingAt,
  pointAt,
  scaleAt,
  settleAt,
  tiltAt,
  type Box,
  type Path,
} from './geometry';

/** Where a flight is in its life. */
export const PHASE = {
  /** Mounted, not measured yet. */
  waiting: 0,
  /** In the air, toward the target (or held by a finger). */
  flying: 1,
  /** Touched down: the two-drawing settle. */
  settling: 2,
  /** Landed and handed over to the target. */
  landed: 3,
  /** Back where it started and handed back to the source. */
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
  /** Whether the two ends' own drawings are hidden yet: a frame after the copy first shows. */
  readonly hid: boolean;
  /** The tilt and drawing held for the current drawing on twos. */
  readonly step: number;
  readonly tilt: number;
}

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

/**
 * The sprite at progress `p` and clock `ms`: on its path, tilted into the curve and swapping
 * drawings on twos, settling in two drawings on landing. With something to become, it fades into
 * that drawing over the last stretch, so the face that left lands as the whole critter.
 */
export function poseAt(
  geom: FlightGeom,
  p: number,
  ms: number,
  morph: boolean,
  drawings: number,
): SpritePose {
  'worklet';
  const at = pointAt(geom.path, p);
  const scale = scaleAt(geom.s0, geom.s1, geom.grow, p);
  const settle = geom.phase === PHASE.settling ? settleAt(ms - geom.landedAt) : null;
  const sx = settle?.sx ?? 1;
  const sy = settle?.sy ?? 1;
  const flying = geom.phase === PHASE.flying;
  // Before it is measured, and once the target or source has its drawing back, nothing shows.
  const gone =
    geom.phase === PHASE.waiting || geom.phase === PHASE.landed || geom.phase === PHASE.returned;
  const opacity = morph ? 1 - ramp(p, 0.85, 1) : 1;
  return {
    x: at.x,
    y: at.y,
    rotate: flying ? geom.tilt : 0,
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

/** The tilt to hold for the drawing showing at `ms`: it changes only when the drawing does. */
export function heldTilt(geom: FlightGeom, p: number, ms: number): FlightGeom {
  'worklet';
  const step = drawingAt(ms);
  if (step === geom.step) return geom;
  return { ...geom, step, tilt: tiltAt(geom.path, p) };
}

/** Where what the sprite becomes stands: centred on the target. */
export function landingCentre(geom: FlightGeom) {
  'worklet';
  return geom.toBox ? centreOf(geom.toBox) : geom.path.p3;
}
