import type { SkImage } from '@shopify/react-native-skia';

import type { Art, SceneRequest } from './art';
import type { ArtCanvas } from './canvas2d/canvas';
import { AlphaType, ColorType } from './canvas2d/skia-enums';
import { markChanges, rectangles, tileMap, type TileRect } from './regions';

/**
 * A full-size scene as a still and the parts of it that move. The still is the scene at `start`
 * (`art.image(req, start)`, drawn once and shared with every other still of it); the moving parts
 * are the rectangles whose pixels change over the loop, each with its own frames. Copying each
 * piece's frame over the still, in place, gives the scene exactly as a whole loop of it would,
 * for a fraction of the memory.
 */
export interface SceneLayers {
  readonly pieces: readonly LayerPiece[];
  readonly fps: number;
  /** Frames in the loop. */
  readonly length: number;
  readonly dpr: number;
  /** Scene time of the first frame (and of the still to draw the pieces over), in seconds. */
  readonly start: number;
  /** What the pieces' frames hold, in bytes. */
  readonly bytes: number;
}

export interface LayerPiece {
  /** Where the piece sits in the scene, CSS pixels. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The piece in each frame of the loop, at `dpr`. */
  readonly frames: readonly SkImage[];
}

export interface LayerOptions {
  /** Frames in the loop (12: a second on twos). */
  frames?: number;
  /** Frames per second the loop is drawn at (12, the renderer's own rate). */
  fps?: number;
  /** Scene time of the first frame (1.2, the moment the renderer draws its stills). */
  start?: number;
  /** The side of a tile the change map is kept in, CSS pixels. */
  tile?: number;
  /**
   * How far (0 to 255, in any channel) a pixel may drift and still count as unchanged. 0 keeps
   * the scene exact; a few levels lets a faint, wide flicker (firelight) stay still.
   */
  tolerance?: number;
  /** The most the pieces' frames may take, in bytes: a quarter of the sprite cache by default. */
  budget?: number;
}

export type LayerResult =
  | { readonly ok: true; readonly layers: SceneLayers }
  | {
      readonly ok: false;
      readonly reason: 'over_budget';
      readonly bytes: number;
      readonly budget: number;
    };

/** The change map is found at this density, then the frames are drawn at the scene's own. */
const LOOK_DPR = 1;
/**
 * CSS pixels kept around each change the coarse look finds: a change it rounds away at the
 * scene's own density (an anti-aliased edge, a breath under a pixel) sits right beside one.
 */
const MARGIN = 2;

const held = new WeakMap<Art, Map<string, SceneLayers>>();

const optionsOf = (o: LayerOptions, art: Art) => ({
  frames: o.frames ?? 12,
  fps: o.fps ?? 12,
  start: o.start ?? 1.2,
  tile: o.tile ?? 8,
  tolerance: o.tolerance ?? 0,
  budget: o.budget ?? art.cache.cap / 4,
});

const words = (image: SkImage | null): Uint32Array => {
  if (!image) throw new Error('nothing drawn');
  const px = image.readPixels(0, 0, {
    width: image.width(),
    height: image.height(),
    colorType: ColorType.RGBA_8888 as never,
    alphaType: AlphaType.Premul as never,
  });
  if (!(px instanceof Uint8Array)) throw new Error('Could not read the pixels');
  return new Uint32Array(px.buffer, px.byteOffset, px.byteLength >> 2);
};

/** A rectangle of tiles in device pixels, clipped to the scene. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const boxOf = (r: TileRect, tile: number, dpr: number, maxW: number, maxH: number): Box => {
  const px = (n: number) => Math.round(n * tile * dpr);
  const x = px(r.x);
  const y = px(r.y);
  return { x, y, w: Math.min(px(r.x + r.w), maxW) - x, h: Math.min(px(r.y + r.h), maxH) - y };
};

/**
 * Bakes `req` as layers one frame of work at a time, so a caller can spread it over idle moments:
 * each `next()` draws one frame (first a quick look at low density to find what moves, then the
 * frames themselves), and the last answers the layers, or that they would take more than the
 * budget (found before any full frame is drawn). A cached bake answers at once. Bake time only,
 * on the JS thread, like `Art.draw`.
 */
export function* bakeSceneLayers(
  art: Art,
  req: SceneRequest,
  options: LayerOptions = {},
): Generator<void, LayerResult, void> {
  const o = optionsOf(options, art);
  const dpr = req.dpr ?? 2;
  const full = { ...req, dpr };
  const key = `layers:${JSON.stringify(full)}:${o.frames}:${o.fps}:${o.start}:${o.tile}:${o.tolerance}`;
  let map = held.get(art);
  if (!map) {
    map = new Map();
    held.set(art, map);
  }
  const hit = map.get(key);
  if (hit && art.cache.has(key)) {
    art.cache.touch(key);
    return { ok: true, layers: hit };
  }

  // A look at low density: which tiles change at all over the loop.
  const look = { ...req, dpr: LOOK_DPR };
  const lw = Math.round(req.width * LOOK_DPR);
  const lh = Math.round(req.height * LOOK_DPR);
  const changes = tileMap(req.width, req.height, o.tile);
  const first = words(art.image(look, o.start)).slice();
  for (let i = 1; i < o.frames; i++) {
    yield;
    const frame = words(art.image(look, o.start + i / o.fps));
    markChanges(changes, first, frame, lw, lh, LOOK_DPR, o.tolerance, MARGIN);
  }
  const maxW = Math.round(req.width * dpr);
  const maxH = Math.round(req.height * dpr);
  const boxes = rectangles(changes)
    .map((r) => boxOf(r, o.tile, dpr, maxW, maxH))
    .filter((b) => b.w > 0 && b.h > 0);
  const bytes = boxes.reduce((sum, b) => sum + b.w * b.h * 4, 0) * o.frames;
  if (bytes > o.budget) return { ok: false, reason: 'over_budget', bytes, budget: o.budget };

  // The frames at the scene's own density, each piece copied out of the whole frame.
  const frames: SkImage[][] = boxes.map(() => []);
  for (let i = 0; i < o.frames; i++) {
    yield;
    const scene = art.draw(full, o.start + i / o.fps);
    boxes.forEach((b, j) => frames[j]?.push(crop(art, scene, b, req.scene)));
  }
  const pieces = boxes.map((b, j) => ({
    x: b.x / dpr,
    y: b.y / dpr,
    width: b.w / dpr,
    height: b.h / dpr,
    frames: frames[j] ?? [],
  }));
  const layers: SceneLayers = {
    pieces,
    fps: o.fps,
    length: o.frames,
    dpr,
    start: o.start,
    bytes,
  };
  map.set(key, layers);
  const owner = map;
  // Like the loops: eviction only lets go of the cache's reference; frames already handed out
  // stay drawable for whoever holds them.
  art.cache.track(key, bytes, () => {
    if (owner.get(key) === layers) owner.delete(key);
  });
  return { ok: true, layers };
}

function crop(art: Art, scene: ArtCanvas, b: Box, name: string): SkImage {
  const cv = art.canvas(b.w, b.h);
  try {
    const g = cv.getContext('2d');
    if (!g) throw new Error('no context');
    g.drawImage(scene, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    const image = cv.snapshot();
    if (!image) throw new Error(`${name}: nothing drawn`);
    return image;
  } finally {
    cv.release();
  }
}

/** `bakeSceneLayers` run to the end at once. */
export function sceneLayers(art: Art, req: SceneRequest, options: LayerOptions = {}): LayerResult {
  const bake = bakeSceneLayers(art, req, options);
  for (;;) {
    const step = bake.next();
    if (step.done) return step.value;
  }
}
