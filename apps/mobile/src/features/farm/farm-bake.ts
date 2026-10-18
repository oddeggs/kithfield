import { critterLayers, type ArtCanvas, type CritterLook } from '@kithfield/art';
import type { Critter } from '@kithfield/contracts';
import type { SkImage } from '@shopify/react-native-skia';

import type { ArtStore } from '../../ui/art/art-store';

/*
 * The farm drawn once, to be moved on the UI thread: the scene's still without its critters and
 * clouds, the clouds as their own sprites (they drift), and each critter's cached layers in the
 * poses it needs. Bake time only: this runs the renderer on the JS thread.
 */

/** The scene time the design's renderer draws a still at. */
export const STILL_T = 1.2;

export interface CloudSprite {
  readonly image: SkImage;
  /** Where the scene starts it, as a fraction of the width, and how fast it drifts (pt/s). */
  readonly x0: number;
  readonly speed: number;
  /** Its middle's height, as a fraction of the scene's. */
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

export interface Backdrop {
  readonly key: string;
  readonly image: SkImage | null;
  readonly clouds: readonly CloudSprite[];
}

export interface BackdropRequest {
  readonly width: number;
  readonly height: number;
  readonly season: string;
  readonly night: boolean;
  /** The cottages with a lamp in the window at night, by the art's names for them. */
  readonly lit: readonly string[];
  /** Mist over a farm nobody has opened in a while. */
  readonly fog: boolean;
}

/** The scene's two clouds, as its foreground draws them (`S.farm.fg`). */
const CLOUDS = [
  { seed: 21, x0: 0.2, y: 0.1, size: 0.2, speed: 3 },
  { seed: 31, x0: 0.7, y: 0.19, size: 0.14, speed: 2 },
] as const;

const held = new WeakMap<ArtStore, Map<string, Backdrop>>();

/**
 * The renderer's cloud sprites, as `art.env.hidden` asks for them while a scene draws. Sprites
 * are made as the scene goes, so the set is looked up again whenever the sprite map has grown.
 */
class CloudCanvases extends WeakSet<object> {
  private seen = -1;
  private readonly known = new Set<object>();

  constructor(
    private readonly sprites: Map<string, { cv: ArtCanvas }>,
    private readonly isCloud: (key: string) => boolean,
  ) {
    super();
  }

  override has(source: object): boolean {
    if (this.sprites.size !== this.seen) {
      this.seen = this.sprites.size;
      for (const [k, sp] of this.sprites) if (this.isCloud(k)) this.known.add(sp.cv);
    }
    return this.known.has(source);
  }
}

/** The farm's still for these settings, drawn once and held in the art's capped cache. */
export function bakeBackdrop(store: ArtStore, r: BackdropRequest): Backdrop {
  const art = store.art;
  const dpr = store.dpr;
  const req = {
    scene: 'farm',
    width: r.width,
    height: r.height,
    dpr,
    attrs: {
      season: r.season,
      night: r.night,
      // An empty `lit` reads as the design's default (four lamps on); `none` lights none.
      lit: r.lit.length > 0 ? r.lit.join(',') : 'none',
      state: 'nocast',
      fog: r.fog,
    },
  };
  const key = `farm-backdrop:${JSON.stringify(req)}`;
  let map = held.get(store);
  if (!map) {
    map = new Map();
    held.set(store, map);
  }
  const hit = map.get(key);
  if (hit && art.cache.has(key)) {
    art.cache.touch(key);
    return hit;
  }

  // The scene is drawn once, with its clouds lifted out as it draws them: a cloud's sprite is
  // made just before it is drawn, so the set of clouds to hide is looked up as drawing goes.
  const prefixes = CLOUDS.map((c) => `cloud${c.seed}:${Math.round(r.width * c.size)}|`);
  const isCloudKey = (k: string) => prefixes.some((p) => k.startsWith(p)) && k.endsWith(`|${dpr}`);
  const clouds = new CloudCanvases(art.internals.sprites, isCloudKey);
  art.env.hidden = { sources: clouds, drawn: () => undefined };
  let image: SkImage | null;
  try {
    image = art.image(req, STILL_T);
  } finally {
    art.env.hidden = null;
  }
  const sprites: CloudSprite[] = r.night
    ? []
    : CLOUDS.flatMap((c, i) => {
        for (const [k, sp] of art.internals.sprites) {
          if (!k.startsWith(prefixes[i] ?? '') || !k.endsWith(`|${dpr}`)) continue;
          const cloud = sp.cv.snapshot();
          if (!cloud) return [];
          return [
            {
              image: cloud,
              x0: c.x0,
              speed: c.speed,
              y: c.y,
              w: sp.W,
              h: sp.H,
              ox: sp.ox,
              oy: sp.oy,
            },
          ];
        }
        return [];
      });
  const backdrop = { key, image, clouds: sprites };
  map.set(key, backdrop);
  const bytes = Math.round(r.width * dpr) * Math.round(r.height * dpr) * 4;
  const owner = map;
  art.cache.track(key, bytes, () => {
    if (owner.get(key) === backdrop) owner.delete(key);
  });
  return backdrop;
}

/**
 * A critter in one pose, its layers and the scene's soft shadow under its feet composed into one
 * image, drawn from its feet at (`ox`, `oy`) in a `w`×`h` box.
 */
export interface Pose {
  readonly image: SkImage | null;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

export interface CritterPoses {
  /** Eyes open and blinking while awake; eyes shut for a sleeping critter (`blink` is null). */
  readonly open: Pose;
  readonly blink: Pose | null;
}

/** The art's look for a critter as the contracts carry it: coat, marking, outfit, accessory. */
export const lookOf = (critter: Critter): CritterLook => ({
  coat: critter.coat,
  ...(critter.mark ? { mark: critter.mark } : {}),
  ...(critter.outfit
    ? {
        outfit: {
          name: critter.outfit,
          ...(critter.outfitColor ? { color: critter.outfitColor } : {}),
        },
      }
    : {}),
  ...(critter.accessory ? { accessory: { name: critter.accessory } } : {}),
});

/** A critter as the cast string the art's group scenes take: `kind/coat/mark/outfit/colour/z`. */
export const castOf = (critter: Critter, asleep = false): string =>
  [
    critter.species,
    critter.coat,
    critter.mark ?? '',
    critter.outfit ?? '',
    critter.outfitColor ?? '',
    asleep ? 'z' : '',
  ].join('/');

const poses = new WeakMap<ArtStore, Map<string, Pose>>();

/**
 * One pose as one image: the scene's shadow (`critter()` in the renderer: a 0.16 ink ellipse
 * 0.72 by 0.13 of the critter's size, just under its feet) and the cached layers on top, drawn
 * through the art's own canvas, once, and held in the art's capped cache.
 */
function composePose(
  store: ArtStore,
  critter: Critter,
  size: number,
  dir: 1 | -1,
  state: 'open' | 'blink' | 'sleep',
): Pose {
  const art = store.art;
  const dpr = store.dpr;
  const layers = critterLayers(art, critter.species, lookOf(critter), { size, state, dir, dpr });
  const first = layers[0];
  const key = `farm-pose:${layers.map((l) => l.key).join('+')}`;
  let map = poses.get(store);
  if (!map) {
    map = new Map();
    poses.set(store, map);
  }
  const hit = map.get(key);
  if (hit && art.cache.has(key)) {
    art.cache.touch(key);
    return hit;
  }
  const w = first?.width ?? 0;
  const h = first?.height ?? 0;
  const ox = first?.originX ?? 0;
  const oy = first?.originY ?? 0;
  const s = Math.max(8, Math.round(size));
  const cv = art.canvas(Math.ceil(w * dpr), Math.ceil(h * dpr));
  const g = cv.getContext('2d');
  if (g) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = 'rgba(55,40,25,.16)';
    g.beginPath();
    g.ellipse(ox, oy - s * 0.01, s * 0.36, s * 0.065, 0, 0, Math.PI * 2);
    g.fill();
    for (const l of layers) g.drawImage(l.canvas, 0, 0, w, h);
  }
  const pose: Pose = { image: cv.snapshot(), w, h, ox, oy };
  cv.release();
  map.set(key, pose);
  const owner = map;
  art.cache.track(key, Math.ceil(w * dpr) * Math.ceil(h * dpr) * 4, () => {
    if (owner.get(key) === pose) owner.delete(key);
  });
  return pose;
}

/** A critter's poses: awake (open and blinking) or asleep. */
export function bakeCritter(
  store: ArtStore,
  critter: Critter,
  size: number,
  dir: 1 | -1,
  asleep: boolean,
): CritterPoses {
  return asleep
    ? { open: composePose(store, critter, size, dir, 'sleep'), blink: null }
    : {
        open: composePose(store, critter, size, dir, 'open'),
        blink: composePose(store, critter, size, dir, 'blink'),
      };
}
