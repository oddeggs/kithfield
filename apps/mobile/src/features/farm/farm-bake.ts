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

  let clouds: CloudSprite[] = [];
  let hidden: ArtCanvas[] = [];
  if (!r.night) {
    // Drawn once as the scene draws it, so its cloud sprites exist to be lifted out.
    art.draw(req, STILL_T);
    const found = CLOUDS.flatMap((c) => {
      const prefix = `cloud${c.seed}:${Math.round(r.width * c.size)}|`;
      for (const [k, sp] of art.internals.sprites) {
        if (!k.startsWith(prefix) || !k.endsWith(`|${dpr}`)) continue;
        const image = sp.cv.snapshot();
        if (!image) return [];
        const cloud = {
          image,
          x0: c.x0,
          speed: c.speed,
          y: c.y,
          w: sp.W,
          h: sp.H,
          ox: sp.ox,
          oy: sp.oy,
        };
        return [{ cloud, canvas: sp.cv }];
      }
      return [];
    });
    clouds = found.map((f) => f.cloud);
    hidden = found.map((f) => f.canvas);
  }
  art.env.hidden = { sources: new WeakSet<object>(hidden), drawn: () => undefined };
  let image: SkImage | null;
  try {
    image = art.image(req, STILL_T);
  } finally {
    art.env.hidden = null;
  }
  const backdrop = { key, image, clouds };
  map.set(key, backdrop);
  const bytes = Math.round(r.width * dpr) * Math.round(r.height * dpr) * 4;
  const owner = map;
  art.cache.track(key, bytes, () => {
    if (owner.get(key) === backdrop) owner.delete(key);
  });
  return backdrop;
}

/** One cached layer of a critter, placed from its feet. */
export interface PlacedLayer {
  readonly key: string;
  readonly image: SkImage | null;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CritterPoses {
  /** Eyes open, then blinking; empty for a sleeping critter. */
  readonly open: readonly PlacedLayer[];
  readonly blink: readonly PlacedLayer[];
  /** Eyes shut; empty for one awake. */
  readonly sleep: readonly PlacedLayer[];
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

/** A critter's layers in the poses it needs: awake (open and blinking) or asleep. */
export function bakeCritter(
  store: ArtStore,
  critter: Critter,
  size: number,
  dir: 1 | -1,
  asleep: boolean,
): CritterPoses {
  const pose = (state: 'open' | 'blink' | 'sleep'): PlacedLayer[] =>
    critterLayers(store.art, critter.species, lookOf(critter), {
      size,
      state,
      dir,
      dpr: store.dpr,
    }).map((l) => ({
      key: l.key,
      image: l.image,
      x: -l.originX,
      y: -l.originY,
      w: l.width,
      h: l.height,
    }));
  return asleep
    ? { open: [], blink: [], sleep: pose('sleep') }
    : { open: pose('open'), blink: pose('blink'), sleep: [] };
}
