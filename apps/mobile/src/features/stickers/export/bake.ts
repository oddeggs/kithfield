import type { Art } from '@kithfield/art';
import {
  assembleAnimatedWebp,
  assembleApng,
  changedIndexRect,
  changedRect,
  encodeIndexedPng,
  indexer,
  LOOP_FRAMES,
  paletteBuilder,
  type Palette,
  type Rect,
} from '@kithfield/art/stickers';
import { AlphaType, ColorType, ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';

import { whenIdle } from '../../../ui/art/art-provider';

/*
 * Stickers made on the phone, from the same drawings the app shows. Each frame is drawn by the
 * art, read, and let go at once, so a bake holds one frame's pixels at a time (and, for Messages,
 * each frame's palette indexes, a byte a pixel). Only the part that changed since the frame
 * before is kept, and the parts are joined into one animated file that fits the other app's
 * limit. A sticker over the limit is made again with fewer colours or at a lower quality, then
 * with fewer frames a second. The JS thread gets a turn between every frame.
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

/** A baked sticker, and whether it fits the spec's limit. */
export interface Baked {
  readonly bytes: Uint8Array;
  readonly fits: boolean;
}

/** Lets the JS thread draw a frame of the screen between frames of a bake. */
export const breathe = () => new Promise<void>((resolve) => whenIdle(resolve));

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

/**
 * Draws each frame of the loop and hands it over, then lets its image go. False when cancelled.
 */
async function eachFrame(
  art: Art,
  attrs: Readonly<Record<string, string>>,
  size: number,
  fps: number,
  cancelled: () => boolean,
  use: (px: Uint8Array, image: SkImage) => void,
): Promise<boolean> {
  const req = { scene: 'sticker', width: size, height: size, dpr: 1, attrs: { ...attrs } };
  const count = Math.max(1, Math.round(loopSeconds(attrs['pose']) * fps));
  for (let i = 0; i < count; i++) {
    if (cancelled()) return false;
    const image = art.image(req, i / fps);
    if (!image) throw new Error('The sticker drew nothing');
    try {
      use(pixelsOf(image), image);
    } finally {
      image.dispose();
    }
    await breathe();
  }
  return true;
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
  const part = surface.makeImageSnapshot();
  const bytes = part.encodeToBytes(ImageFormat.WEBP, quality);
  part.dispose();
  surface.dispose();
  return bytes;
}

interface Part {
  readonly bytes: Uint8Array;
  readonly x: number;
  readonly y: number;
  durationMs: number;
}

/** Keeps a frame's changed part, or holds the frame before it longer when nothing changed. */
function keep(parts: Part[], rect: Rect | null, fps: number, encode: (r: Rect) => Uint8Array) {
  const last = parts[parts.length - 1];
  if (rect === null && last) {
    last.durationMs += 1000 / fps;
    return;
  }
  if (rect === null) return;
  parts.push({ bytes: encode(rect), x: rect.x, y: rect.y, durationMs: 1000 / fps });
}

/** Indexes in a big palette, moved to their nearest colours in a smaller one. */
function remap(indexes: readonly Uint8Array[], from: Palette, to: Palette): Uint8Array[] {
  const table = indexer(to)(from.colours);
  return indexes.map((idx) => idx.map((i) => table[i] ?? 0));
}

async function apngs(
  art: Art,
  attrs: Readonly<Record<string, string>>,
  spec: BakeSpec,
  fps: number,
  cancelled: () => boolean,
): Promise<Uint8Array[] | null> {
  const { size } = spec;
  // First pass: the colours. Second: each frame as indexes in the fullest palette.
  const builder = paletteBuilder();
  if (!(await eachFrame(art, attrs, size, fps, cancelled, (px) => builder.add(px)))) return null;
  const sizes = spec.colours ?? [256];
  const full = builder.build(sizes[0]);
  const toIndexes = indexer(full);
  const indexes: Uint8Array[] = [];
  if (!(await eachFrame(art, attrs, size, fps, cancelled, (px) => indexes.push(toIndexes(px))))) {
    return null;
  }
  const out: Uint8Array[] = [];
  for (const [n, colours] of sizes.entries()) {
    const palette = n === 0 ? full : builder.build(colours);
    const frames = n === 0 ? indexes : remap(indexes, full, palette);
    const parts: Part[] = [];
    let prev: Uint8Array | null = null;
    for (const f of frames) {
      const rect =
        prev === null ? { x: 0, y: 0, w: size, h: size } : changedIndexRect(prev, f, size, size);
      keep(parts, rect, fps, (r) => encodeIndexedPng(f, size, palette, r));
      prev = f;
      await breathe();
    }
    out.push(
      assembleApng(
        { width: size, height: size, loops: 0 },
        parts.map((p) => ({ png: p.bytes, x: p.x, y: p.y, delayMs: Math.round(p.durationMs) })),
      ),
    );
    if ((out[out.length - 1]?.length ?? Infinity) <= spec.maxBytes) break;
  }
  return out;
}

async function webp(
  art: Art,
  attrs: Readonly<Record<string, string>>,
  spec: BakeSpec,
  fps: number,
  quality: number,
  cancelled: () => boolean,
): Promise<Uint8Array | null> {
  const { size } = spec;
  const parts: Part[] = [];
  let prev: Uint8Array | null = null;
  const drawn = await eachFrame(art, attrs, size, fps, cancelled, (px, image) => {
    const rect =
      prev === null ? { x: 0, y: 0, w: size, h: size } : changedRect(prev, px, size, size, 2);
    keep(parts, rect, fps, (r) => webpOf(image, r, quality));
    prev = px;
  });
  if (!drawn) return null;
  return assembleAnimatedWebp(
    { width: size, height: size, loops: 0 },
    parts.map((p) => ({ webp: p.bytes, x: p.x, y: p.y, durationMs: Math.round(p.durationMs) })),
  );
}

/**
 * One sticker as an animated file: the `sticker` scene with `attrs`, looping, the best that fits
 * `spec.maxBytes` (or the smallest it could make, with `fits: false`). Null when cancelled.
 */
export async function bakeSticker(
  art: Art,
  attrs: Readonly<Record<string, string>>,
  spec: BakeSpec,
  cancelled: () => boolean = () => false,
): Promise<Baked | null> {
  let smallest: Uint8Array | null = null;
  const consider = (bytes: Uint8Array) => {
    if (smallest === null || bytes.length < smallest.length) smallest = bytes;
    return bytes.length <= spec.maxBytes;
  };
  for (const fps of spec.fps) {
    if (spec.format === 'apng') {
      const tries = await apngs(art, attrs, spec, fps, cancelled);
      if (tries === null) return null;
      for (const bytes of tries) if (consider(bytes)) return { bytes, fits: true };
    } else {
      for (const quality of spec.qualities ?? [75]) {
        const bytes = await webp(art, attrs, spec, fps, quality, cancelled);
        if (bytes === null) return null;
        if (consider(bytes)) return { bytes, fits: true };
      }
    }
  }
  const best: Uint8Array | null = smallest;
  return best === null ? null : { bytes: best, fits: false };
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
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  image.dispose();
  return bytes;
}
