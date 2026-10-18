import type { Art } from '@kithfield/art';
import { AlphaType, ColorType, ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';

import { whenIdle } from '../../../ui/art/art-provider';
import { assembleApng } from '@kithfield/art/stickers';
import { changedRect, type Rect } from '@kithfield/art/stickers';
import { changedIndexRect, encodeIndexedPng } from '@kithfield/art/stickers';
import { buildPalette, indexer } from '@kithfield/art/stickers';
import { assembleAnimatedWebp } from '@kithfield/art/stickers';
import { LOOP_FRAMES } from '@kithfield/art/stickers';

/*
 * Stickers made on the phone, from the same drawings the app shows: each frame drawn by the art
 * at the export's size, only the part that changed since the frame before kept, and the parts
 * joined into one animated file that fits the other app's limit. A sticker over the limit is
 * made again with fewer colours or at a lower quality, then with fewer frames a second.
 */

/** The loop's own length, in seconds: the pose's seamless length, else two seconds. */
export function loopSeconds(pose: string | undefined): number {
  const frames = pose ? LOOP_FRAMES[pose] : undefined;
  return frames ? frames / 30 : 2;
}

export interface BakeSpec {
  /** Pixels on each side. */
  readonly size: number;
  /** Frame rates to try, best first. */
  readonly fps: readonly number[];
  readonly format: 'apng' | 'webp';
  /** The most bytes one sticker may take. */
  readonly maxBytes: number;
  /** WebP qualities to try at each rate, best first (lossy, with alpha). */
  readonly qualities?: readonly number[];
  /** Palette sizes to try at each rate, largest first. */
  readonly colours?: readonly number[];
}

interface Frame {
  readonly image: SkImage;
  readonly px: Uint8Array;
}

/** Lets the JS thread draw a frame of the screen between frames of a bake. */
const breathe = () => new Promise<void>((resolve) => whenIdle(resolve));

function pixelsOf(image: SkImage): Uint8Array {
  const px = image.readPixels(0, 0, {
    width: image.width(),
    height: image.height(),
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!(px instanceof Uint8Array)) throw new Error('Could not read the frame');
  return px;
}

async function drawFrames(
  art: Art,
  attrs: Readonly<Record<string, string>>,
  size: number,
  fps: number,
  cancelled: () => boolean,
): Promise<Frame[] | null> {
  const req = { scene: 'sticker', width: size, height: size, dpr: 1, attrs: { ...attrs } };
  const count = Math.max(1, Math.round(loopSeconds(attrs['pose']) * fps));
  const frames: Frame[] = [];
  for (let i = 0; i < count; i++) {
    if (cancelled()) return null;
    const image = art.image(req, i / fps);
    if (!image) throw new Error('The sticker drew nothing');
    frames.push({ image, px: pixelsOf(image) });
    await breathe();
  }
  return frames;
}

/** A rectangle of an image as a still WebP. */
function webpOf(image: SkImage, rect: Rect, quality: number): Uint8Array {
  if (rect.x === 0 && rect.y === 0 && rect.w === image.width() && rect.h === image.height()) {
    return image.encodeToBytes(ImageFormat.WEBP, quality);
  }
  const surface = Skia.Surface.Make(rect.w, rect.h);
  if (!surface) throw new Error('No surface for a frame');
  surface
    .getCanvas()
    .drawImageRect(
      image,
      Skia.XYWHRect(rect.x, rect.y, rect.w, rect.h),
      Skia.XYWHRect(0, 0, rect.w, rect.h),
      Skia.Paint(),
    );
  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.WEBP, quality);
  surface.dispose?.();
  return bytes;
}

interface Part {
  readonly bytes: Uint8Array;
  readonly x: number;
  readonly y: number;
  durationMs: number;
}

/** Frames as kept parts: a frame that changes nothing holds the one before it longer. */
function partsOf<T>(
  frames: readonly T[],
  fps: number,
  diff: (prev: T, next: T) => Rect | null,
  full: Rect,
  encode: (frame: T, rect: Rect) => Uint8Array,
): Part[] {
  const parts: Part[] = [];
  let prev: T | null = null;
  for (const f of frames) {
    const rect = prev === null ? full : diff(prev, f);
    const last = parts[parts.length - 1];
    if (rect === null && last) last.durationMs += 1000 / fps;
    else {
      const r = rect ?? full;
      parts.push({ bytes: encode(f, r), x: r.x, y: r.y, durationMs: 1000 / fps });
    }
    prev = f;
  }
  return parts;
}

function apng(frames: readonly Frame[], spec: BakeSpec, fps: number, colours: number): Uint8Array {
  const { size } = spec;
  const palette = buildPalette(
    frames.map((f) => f.px),
    colours,
  );
  const toIndexes = indexer(palette);
  const indexes = frames.map((f) => toIndexes(f.px));
  const parts = partsOf(
    indexes,
    fps,
    (a, b) => changedIndexRect(a, b, size, size),
    { x: 0, y: 0, w: size, h: size },
    (f, r) => encodeIndexedPng(f, size, palette, r),
  );
  return assembleApng(
    { width: size, height: size, loops: 0 },
    parts.map((p) => ({ png: p.bytes, x: p.x, y: p.y, delayMs: Math.round(p.durationMs) })),
  );
}

function webp(frames: readonly Frame[], spec: BakeSpec, fps: number, quality: number): Uint8Array {
  const { size } = spec;
  const parts = partsOf(
    frames,
    fps,
    (a, b) => changedRect(a.px, b.px, size, size, 2),
    { x: 0, y: 0, w: size, h: size },
    (f, r) => webpOf(f.image, r, quality),
  );
  return assembleAnimatedWebp(
    { width: size, height: size, loops: 0 },
    parts.map((p) => ({ webp: p.bytes, x: p.x, y: p.y, durationMs: Math.round(p.durationMs) })),
  );
}

/**
 * One sticker as an animated file: the `sticker` scene with `attrs`, looping, the best that fits
 * `spec.maxBytes`. Null when cancelled; the smallest it could make when nothing fits.
 */
export async function bakeSticker(
  art: Art,
  attrs: Readonly<Record<string, string>>,
  spec: BakeSpec,
  cancelled: () => boolean = () => false,
): Promise<Uint8Array | null> {
  let smallest: Uint8Array | null = null;
  for (const fps of spec.fps) {
    const frames = await drawFrames(art, attrs, spec.size, fps, cancelled);
    if (frames === null) return null;
    const steps = spec.format === 'apng' ? (spec.colours ?? [256]) : (spec.qualities ?? [75]);
    for (const step of steps) {
      const bytes =
        spec.format === 'apng' ? apng(frames, spec, fps, step) : webp(frames, spec, fps, step);
      if (bytes.length <= spec.maxBytes) return bytes;
      if (smallest === null || bytes.length < smallest.length) smallest = bytes;
      await breathe();
    }
  }
  return smallest;
}

/** A still of the sticker (the art's own still moment), as a PNG: tray icons and covers. */
export function bakeStill(
  art: Art,
  attrs: Readonly<Record<string, string>>,
  size: number,
  t = 1.2,
): Uint8Array {
  const image = art.image(
    { scene: 'sticker', width: size, height: size, dpr: 1, attrs: { ...attrs } },
    t,
  );
  if (!image) throw new Error('The sticker drew nothing');
  return image.encodeToBytes(ImageFormat.PNG, 100);
}
