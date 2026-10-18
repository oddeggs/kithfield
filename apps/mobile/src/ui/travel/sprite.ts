import { critterLayers, type CritterLook, type SceneAttrs } from '@kithfield/art';
import { motion } from '@kithfield/theme';
import type { SkImage } from '@shopify/react-native-skia';

import type { ArtStore } from '../art/art-store';

/** One image of a drawing, placed in the sprite's own box (points, top left at 0, 0). */
export interface PlacedImage {
  readonly image: SkImage | null;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * What flies: the art already drawn, as cached images. `drawings` holds one to three slightly
 * different drawings of it that swap on twos while it flies; each is the layers drawn in order.
 */
export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly drawings: readonly (readonly PlacedImage[])[];
  /** A circle of this colour behind the drawing, clipping it: a critter's face as an avatar. */
  readonly disc?: string;
}

/**
 * What flies, as a feature describes it: a scene of the art (`icon`, `seed`, `plant`, `pose`…),
 * a critter's face as its avatar draws it, a whole critter from its layers, or images already drawn.
 */
export type SpriteSpec =
  | {
      readonly scene: string;
      readonly attrs?: SceneAttrs;
      readonly width: number;
      readonly height: number;
      /** Drawings of it to swap between on twos (the art's own frames), 1 to 3. */
      readonly drawings?: number;
    }
  | { readonly avatar: string; readonly look?: CritterLook; readonly size: number }
  | {
      readonly critter: string;
      readonly look?: CritterLook;
      /** The size the art draws it at (its `size`), and the box it is centred in. */
      readonly size: number;
      readonly dir?: 1 | -1;
      readonly asleep?: boolean;
    }
  | { readonly sprite: Sprite };

/** The moment the renderer draws a still at, and the next drawings on twos after it. */
const STILL_T = 1.2;
const MAX_DRAWINGS = 3;

/** A scene's stills at successive moments on twos: the art's own drawings, never redrawn by hand. */
function sceneSprite(
  store: ArtStore,
  scene: string,
  attrs: SceneAttrs | undefined,
  width: number,
  height: number,
  count: number,
): Sprite {
  const n = Math.max(1, Math.min(MAX_DRAWINGS, Math.round(count)));
  const req = { scene, width, height, ...(attrs ? { attrs } : {}) };
  const drawings = Array.from({ length: n }, (_, i) => [
    {
      image: store.still(req, STILL_T + (i * motion.twos.frameMs) / 1000),
      x: 0,
      y: 0,
      w: width,
      h: height,
    },
  ]);
  return { width, height, drawings };
}

/** A critter's face in its circle, from the same cached layers as every `Avatar`. */
function avatarSprite(
  store: ArtStore,
  kind: string,
  look: CritterLook | undefined,
  size: number,
): Sprite {
  const layers = store.avatarLayers({ kind, size, ...(look ? { look } : {}) });
  return {
    width: size,
    height: size,
    drawings: [layers.map(({ image, x, y, w, h }) => ({ image, x, y, w, h }))],
    disc: store.avatarTint(kind, look?.coat),
  };
}

/**
 * A whole critter standing in a `size` box, feet near its bottom, as the farm and the strip draw
 * it: one drawing, eyes open (asleep, eyes shut), so it never blinks mid-flight.
 */
function critterSprite(
  store: ArtStore,
  kind: string,
  look: CritterLook | undefined,
  size: number,
  dir: 1 | -1,
  asleep: boolean,
): Sprite {
  const states = asleep ? (['sleep'] as const) : (['open'] as const);
  const feetX = size / 2;
  const feetY = size * 0.92;
  const drawings = states.map((state) =>
    critterLayers(store.art, kind, look ?? {}, { size, state, dir, dpr: store.dpr }).map((l) => ({
      image: l.image,
      x: feetX - l.originX,
      y: feetY - l.originY,
      w: l.width,
      h: l.height,
    })),
  );
  return { width: size, height: size, drawings };
}

/** The sprite a spec describes, drawn from the art's caches (bake time: the JS thread). */
export function spriteOf(store: ArtStore, spec: SpriteSpec): Sprite {
  if ('sprite' in spec) return spec.sprite;
  if ('scene' in spec) {
    return sceneSprite(store, spec.scene, spec.attrs, spec.width, spec.height, spec.drawings ?? 1);
  }
  if ('avatar' in spec) return avatarSprite(store, spec.avatar, spec.look, spec.size);
  return critterSprite(
    store,
    spec.critter,
    spec.look,
    spec.size,
    spec.dir ?? 1,
    spec.asleep ?? false,
  );
}
