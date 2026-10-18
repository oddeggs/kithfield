import type { SkImage } from '@shopify/react-native-skia';

import type { Art, SceneRequest } from './art';
import type { ArtContext2D } from './canvas2d/context';

/**
 * Loops drawn on twos: the renderer animates at 12 frames a second, so a loop is a set of frames
 * drawn once and then picked by index, never redrawn while it plays.
 */
export interface LoopOptions {
  /** Frames in the loop (12 for a scene, 24 for the fire). */
  frames?: number;
  /** Frames per second the loop was drawn at (12, the renderer's own rate). */
  fps?: number;
  /** Scene time of the first frame, in seconds. */
  start?: number;
}

export class FrameLoop {
  constructor(
    readonly frames: readonly SkImage[],
    readonly fps: number,
  ) {}

  /** The frame index for a clock in seconds; a worklet can do the same maths with `frames.length`. */
  indexAt(seconds: number): number {
    const n = this.frames.length;
    return n === 0 ? 0 : ((Math.floor(seconds * this.fps) % n) + n) % n;
  }

  frameAt(seconds: number): SkImage | null {
    return this.frames[this.indexAt(seconds)] ?? null;
  }
}

/**
 * Each renderer's loops by key. The sprite cache decides when a loop goes: eviction and memory
 * warnings only drop it from here (it is redrawn on the next request); its images are never
 * disposed, because whoever holds the loop may still be drawing them.
 */
const held = new WeakMap<Art, Map<string, FrameLoop>>();

function cached(art: Art, key: string, bytes: number, make: () => FrameLoop): FrameLoop {
  let loops = held.get(art);
  if (!loops) {
    loops = new Map();
    held.set(art, loops);
  }
  const hit = loops.get(key);
  if (hit && art.cache.has(key)) {
    art.cache.touch(key);
    return hit;
  }
  const loop = make();
  loops.set(key, loop);
  const map = loops;
  art.cache.track(key, bytes, () => {
    if (map.get(key) === loop) map.delete(key);
  });
  return loop;
}

const opts = (o: LoopOptions, frames: number) => ({
  frames: o.frames ?? frames,
  fps: o.fps ?? 12,
  start: o.start ?? 0,
});

/**
 * A whole scene as a loop (its background is drawn once and shared by every frame). For small
 * scenes only (a widget, a sticker, an icon): a full-size scene loops in layers instead, a still
 * and only the parts that move (`bakeSceneLayers`). Refuses, with a `RangeError`, a loop that
 * would take more than a quarter of the sprite cache.
 */
export function sceneLoop(art: Art, req: SceneRequest, options: LoopOptions = {}): FrameLoop {
  const { frames, fps, start } = opts(options, 12);
  const dpr = req.dpr ?? 2;
  const bytes = Math.round(req.width * dpr) * Math.round(req.height * dpr) * 4 * frames;
  if (bytes > art.cache.cap / 4) {
    throw new RangeError(
      `${req.scene}: a ${frames}-frame loop needs ${bytes} bytes, over a quarter of the ` +
        `${art.cache.cap}-byte cache; loop it in layers (bakeSceneLayers)`,
    );
  }
  const key = `loop:scene:${JSON.stringify(req)}:${frames}:${fps}:${start}`;
  return cached(art, key, bytes, () => {
    const images: SkImage[] = [];
    for (let i = 0; i < frames; i++) {
      const image = art.image(req, start + i / fps);
      if (!image) throw new Error(`${req.scene}: nothing drawn`);
      images.push(image);
    }
    return new FrameLoop(images, fps);
  });
}

/**
 * Any drawing as a loop on a transparent canvas of `width`×`height` CSS pixels: `draw` is called
 * once per frame with the context (scaled for `dpr`) and the frame's time.
 */
export function drawLoop(
  art: Art,
  key: string,
  size: { width: number; height: number; dpr?: number },
  draw: (g: ArtContext2D, t: number) => void,
  options: LoopOptions = {},
): FrameLoop {
  const { frames, fps, start } = opts(options, 12);
  const dpr = size.dpr ?? 2;
  const w = Math.round(size.width * dpr);
  const h = Math.round(size.height * dpr);
  return cached(art, `loop:${key}:${w}x${h}:${frames}:${fps}:${start}`, w * h * 4 * frames, () => {
    const images: SkImage[] = [];
    const prevU = art.internals.setU(1);
    try {
      for (let i = 0; i < frames; i++) {
        const cv = art.canvas(w, h);
        const g = cv.getContext('2d');
        if (!g) throw new Error('no context');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(g, start + i / fps);
        const image = cv.snapshot();
        if (image) images.push(image);
      }
    } finally {
      art.internals.setU(prevU);
    }
    return new FrameLoop(images, fps);
  });
}

/**
 * The fire on its own (flame and sparks, as the campfire draws them), centred on its base in a
 * `size`-wide square, for drawing over a background that is already cached. 24 frames on twos
 * (two seconds), so the sparks rise and fade before the loop wraps.
 */
export function fireLoop(art: Art, size: number, dpr = 2, options: LoopOptions = {}): FrameLoop {
  const I = art.internals;
  return drawLoop(
    art,
    `fire:${size}`,
    { width: size, height: size, dpr },
    (g, t) => {
      I.flame(g, size / 2, size * 0.9, size * 0.6, t, 7);
      I.sparks(g, size / 2, size * 0.9, size * 0.6, t, 8);
    },
    { frames: 24, ...options },
  );
}
