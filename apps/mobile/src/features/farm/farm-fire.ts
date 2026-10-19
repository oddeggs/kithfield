import { drawLoop } from '@kithfield/art';
import type { SkImage } from '@shopify/react-native-skia';

import type { ArtStore } from '../../ui/art/art-store';
import { LANDMARKS } from './scene-layout';

/*
 * The fire lit on the farm, as the art draws it over the farm scene (`state: 'fire'`, the
 * renderer's `S.farm.fg`): the firelight around the ring, and the flame with its sparks. The farm's
 * still is drawn without its cast, so the fire is drawn on its own with the renderer's own `glow`,
 * `flame` and `sparks` at the scene's sizes, once, and then only shown: the glow as one image, the
 * flame as a loop on twos. The design's stand-in critter by the fire is left out; the farm's own
 * critters stay where they are.
 */

/** The firelight's middle sits this far (of the width) above the ring. */
const GLOW_LIFT = 0.03;
/** The firelight's reach, as a fraction of the width. */
const GLOW_R = 0.26;
/** The firelight's strength by day (drawn over) and by night (lightening what is under it). */
const GLOW_A = { day: 0.35, night: 0.55 } as const;
/** The flame's and the sparks' sizes, as fractions of the width. */
export const FLAME = 0.07;
const SPARKS = 0.06;
/** The box the flame and sparks are drawn in: this far (of the width) each side, above and below the ring. */
const BOX = { side: 0.1, up: 0.2, down: 0.03 } as const;
/** Two seconds on twos: the sparks rise and fade before the loop wraps. */
const FRAMES = 24;

export interface FarmFire {
  readonly key: string;
  /** The firelight, square, its top-left at (`x`, `y`). At night it is drawn with `screen`. */
  readonly glow: {
    readonly image: SkImage | null;
    readonly x: number;
    readonly y: number;
    readonly size: number;
  };
  readonly night: boolean;
  /** The flame and its sparks, a loop drawn on twos, in a `w`×`h` box at (`x`, `y`). */
  readonly flame: {
    readonly frames: readonly SkImage[];
    readonly fps: number;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}

/** The farm's fire for a scene of this size, drawn once and held in the art's capped cache. */
export function bakeFarmFire(
  store: ArtStore,
  width: number,
  height: number,
  night: boolean,
): FarmFire {
  const art = store.art;
  const I = art.internals;
  const dpr = store.dpr;
  const fx = width * LANDMARKS.fire.x;
  const fy = height * LANDMARKS.fire.y;

  const r = width * GLOW_R;
  const glowLoop = drawLoop(
    art,
    `farm-fire-glow:${night ? 'night' : 'day'}`,
    { width: r * 2, height: r * 2, dpr },
    // Drawn over nothing here; the canvas puts it over the farm with the art's own blend.
    (g) => I.glow(g, r, r, r, '#ffb050', night ? GLOW_A.night : GLOW_A.day, 'source-over'),
    { frames: 1 },
  );

  const box = {
    x: fx - width * BOX.side,
    y: fy - width * BOX.up,
    w: width * BOX.side * 2,
    h: width * (BOX.up + BOX.down),
  };
  const bx = fx - box.x;
  const by = fy - box.y;
  const flameLoop = drawLoop(
    art,
    'farm-fire-flame',
    { width: box.w, height: box.h, dpr },
    (g, t) => {
      I.flame(g, bx, by, width * FLAME, t, 17);
      I.sparks(g, bx, by, width * SPARKS, t, 18);
    },
    { frames: FRAMES },
  );

  return {
    key: `${width}x${height}:${night ? 'night' : 'day'}`,
    glow: {
      image: glowLoop.frames[0] ?? null,
      x: fx - r,
      y: fy - width * GLOW_LIFT - r,
      size: r * 2,
    },
    night,
    flame: { frames: flameLoop.frames, fps: flameLoop.fps, ...box },
  };
}
