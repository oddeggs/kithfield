import type { SkImage } from '@shopify/react-native-skia';

import type { Art, SceneAttrs } from './art';
import type { ArtCanvas } from './canvas2d/canvas';
import type { ArtContext2D } from './canvas2d/context';
import type { Affine } from './canvas2d/matrix';
import type { CritterDef } from './internals';

/** A worn item: an outfit or accessory name from the design (`scarf`, `beanie`…) and its colour. */
export interface Wearable {
  name: string;
  color?: string;
}

/** How one critter looks, slot by slot. Each slot is its own cached layer. */
export interface CritterLook {
  coat?: string;
  mark?: string;
  outfit?: Wearable;
  accessory?: Wearable;
}

export type CritterState = 'open' | 'blink' | 'sleep';

export interface CritterPose {
  /** Size in CSS pixels, as the renderer sizes critters (about the body's height). */
  size: number;
  state?: CritterState;
  /** 1 faces right, -1 faces left. */
  dir?: 1 | -1;
  dpr?: number;
}

export type LayerSlot = 'body' | 'mark' | 'outfit' | 'accessory';

/**
 * One cached layer. Every layer of a critter shares the sprite box of the renderer's own critter
 * sprite: `width`×`height` CSS pixels, with the critter's feet at (`originX`, `originY`).
 */
export interface CritterLayer {
  slot: LayerSlot;
  key: string;
  canvas: ArtCanvas;
  image: SkImage | null;
  width: number;
  height: number;
  originX: number;
  originY: number;
  dpr: number;
}

/** The renderer's critter sprite box for `size` (`critterSprite` in the design file). */
function spriteBox(size: number) {
  const s = Math.max(8, Math.round(size));
  const W = s * 1.3;
  const H = s * 1.55;
  return { s, W, H, ox: W / 2, oy: H - s * 0.08 };
}

/**
 * The critter's layers, bottom to top: body and coat, marking, outfit, accessory. Each is drawn
 * once by the design's own functions (`drawCritter`, `drawMark`, `drawOutfit`) into the renderer's
 * sprite cache, so a farm of critters in many outfits holds one body per coat and one sprite per
 * item, never one per combination.
 *
 * Markings paint over the body with `source-atop`; their layer is drawn with that mode as plain
 * `source-over` and then masked by the body, which is the same image wherever the body is opaque
 * (everywhere but its anti-aliased rim).
 */
export function critterLayers(
  art: Art,
  kind: string,
  look: CritterLook,
  pose: CritterPose,
): CritterLayer[] {
  const I = art.internals;
  const K = I.CR[kind] ? kind : 'rabbit';
  const st = pose.state ?? 'open';
  const dir = pose.dir ?? 1;
  const dpr = pose.dpr ?? 2;
  const { s, W, H, ox, oy } = spriteBox(pose.size);
  const k = s / 100;
  const lw = Math.min(2.5, Math.max(0.8, s / 44));
  const coat = look.coat && I.COATS[K]?.[look.coat] ? look.coat : null;
  const anchored = !!I.ANCH[K];
  const base = `${K}:${st}:${dir}:${s}`;

  const layer = (slot: LayerSlot, key: string, draw: (g: ArtContext2D) => void): CritterLayer => {
    const sp = I.sprite(`layer:${slot}:${key}`, W, H, ox, oy, dpr, (g) => {
      g.scale(k * dir, k);
      const prev = I.setU(1 / k);
      try {
        draw(g);
      } finally {
        I.setU(prev);
      }
    });
    return {
      slot,
      key: `layer:${slot}:${key}`,
      canvas: sp.cv,
      image: sp.cv.snapshot(),
      width: W,
      height: H,
      originX: ox,
      originY: oy,
      dpr,
    };
  };

  const body = layer('body', `${base}:${coat ?? ''}`, (g) =>
    I.drawCritter(g, K, st, lw, coat ? { coat } : null),
  );
  const out = [body];
  if (look.mark && anchored) {
    const def: CritterDef = coat
      ? (Object.assign(Object.create(I.CR[K] ?? null), I.COATS[K]?.[coat]) as CritterDef)
      : (I.CR[K] as CritterDef);
    out.push(
      layer('mark', `${base}:${coat ?? ''}:${look.mark}`, (g) => {
        g.compositeOverride = { 'source-atop': 'source-over' };
        try {
          I.drawMark(g, K, look.mark ?? '', def, st, lw);
        } finally {
          g.compositeOverride = null;
        }
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(body.canvas, 0, 0);
        g.restore();
      }),
    );
  }
  for (const slot of ['outfit', 'accessory'] as const) {
    const item = look[slot];
    if (!item || !anchored) continue;
    out.push(
      layer(slot, `${base}:${item.name}:${item.color ?? ''}`, (g) =>
        I.drawOutfit(g, K, item.name, item.color ?? null, lw),
      ),
    );
  }
  return out;
}

/** One frame of a companion, with where the critter beside it stands in that frame. */
export interface CompanionFrame {
  canvas: ArtCanvas;
  image: SkImage | null;
  /** The critter's anchor in the frame (CSS px) and the transform it was drawn with. */
  critter: { x: number; y: number; transform: Affine } | null;
}

/**
 * A companion (`duckling`, `snail`, `moth`, `butterfly`, `bee`, `ladybird`, `firefly`) as the
 * shop's buddy scene draws it beside `kind`, with the critter itself lifted out: the frame holds
 * only the companion, and reports where the critter would stand so its layers go underneath.
 */
export function companionFrame(
  art: Art,
  name: string,
  kind: string,
  req: { width: number; height: number; dpr?: number; t: number; attrs?: SceneAttrs },
): CompanionFrame {
  const I = art.internals;
  const scene = I.S['buddy'];
  const dpr = req.dpr ?? 2;
  const cv = art.canvas(Math.round(req.width * dpr), Math.round(req.height * dpr));
  const g = cv.getContext('2d');
  if (!scene?.fg || !g) throw new Error('The buddy scene is missing from the art');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  let critter: CompanionFrame['critter'] = null;
  art.env.hidden = {
    sources: art.critterCanvases,
    drawn: (m) => {
      critter ??= { x: m[4] / dpr, y: m[5] / dpr, transform: m };
    },
  };
  const prevU = I.setU(1);
  try {
    scene.fg(g, req.width, req.height, req.t, {
      ...req.attrs,
      kind,
      name,
      dpr,
      v: {},
      season: 'spring',
    });
  } finally {
    I.setU(prevU);
    art.env.hidden = null;
  }
  return { canvas: cv, image: cv.snapshot(), critter };
}
