import type { SkImage } from '@shopify/react-native-skia';

import type { Art, SceneRequest } from './art';
import type { ArtContext2D } from './canvas2d/context';

/**
 * Loops drawn on twos: the renderer animates at 12 frames a second, so a loop is a dozen frames
 * drawn once and then picked by index, never redrawn while it plays.
 */
export interface LoopOptions {
  /** Frames in the loop (12). */
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

  /** The frame index for a clock in seconds; safe to call from a worklet with the same maths. */
  indexAt(seconds: number): number {
    const n = this.frames.length;
    return n === 0 ? 0 : ((Math.floor(seconds * this.fps) % n) + n) % n;
  }

  frameAt(seconds: number): SkImage | null {
    return this.frames[this.indexAt(seconds)] ?? null;
  }
}

const opts = (o: LoopOptions) => ({
  frames: o.frames ?? 12,
  fps: o.fps ?? 12,
  start: o.start ?? 0,
});

/** A whole scene as a loop (its background is drawn once and shared by every frame). */
export function sceneLoop(art: Art, req: SceneRequest, options: LoopOptions = {}): FrameLoop {
  const { frames, fps, start } = opts(options);
  const key = `loop:${JSON.stringify(req)}:${frames}:${fps}:${start}`;
  const images: SkImage[] = [];
  for (let i = 0; i < frames; i++) {
    const image = art.image(req, start + i / fps);
    if (!image) throw new Error(`${req.scene}: nothing drawn`);
    images.push(image);
  }
  const bytes = images.reduce((a, im) => a + im.width() * im.height() * 4, 0);
  art.cache.track(key, bytes, () => images.forEach((im) => im.dispose?.()));
  return new FrameLoop(images, fps);
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
  const { frames, fps, start } = opts(options);
  const dpr = size.dpr ?? 2;
  const images: SkImage[] = [];
  const prevU = art.internals.setU(1);
  try {
    for (let i = 0; i < frames; i++) {
      const cv = art.canvas(Math.round(size.width * dpr), Math.round(size.height * dpr));
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
  const bytes = images.reduce((a, im) => a + im.width() * im.height() * 4, 0);
  art.cache.track(`loop:${key}`, bytes, () => images.forEach((im) => im.dispose?.()));
  return new FrameLoop(images, fps);
}

/**
 * The fire on its own (flame and sparks, as the campfire draws them), centred on its base in a
 * `size`-wide square, for drawing over a background that is already cached.
 */
export function fireLoop(art: Art, size: number, dpr = 2, options: LoopOptions = {}): FrameLoop {
  const I = art.internals;
  return drawLoop(
    art,
    `fire:${size}:${dpr}`,
    { width: size, height: size, dpr },
    (g, t) => {
      I.flame(g, size / 2, size * 0.9, size * 0.6, t, 7);
      I.sparks(g, size / 2, size * 0.9, size * 0.6, t, 8);
    },
    options,
  );
}
