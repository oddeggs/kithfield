import type { Critter } from '@kithfield/contracts';
import { ImageFormat, Skia, TileMode, vec } from '@shopify/react-native-skia';

import { lookOf } from '../../ui/art/critter-look';
import type { ArtStore } from '../../ui/art/art-store';

/** The menu bar's icon is 22 points; drawn at 2x. */
const ICON = 44;
/** The critter's circle inside it, leaving room for the glow round it. */
const FACE = 30;
/** The glow breathes through these many drawings over its 2.4 s, on twos. */
export const GLOW_FRAMES = 12;

/** The glow's colours, as the design's menu-bar critter wears it (honey, firelight). */
export type Glow = 'firefly' | 'fire';
const LIGHT: Readonly<Record<Glow, readonly [number, number, number]>> = {
  firefly: [255, 214, 110],
  fire: [255, 168, 80],
};

/** How bright the glow is at a frame: a sine breath, from faint to full and back. */
export const glowAt = (frame: number): number =>
  0.35 + 0.65 * (0.5 - 0.5 * Math.cos((2 * Math.PI * frame) / GLOW_FRAMES));

/**
 * The menu-bar or tray critter as PNGs: the person's own critter in its circle (its layers from
 * the art, drawn once), and, while something waits, a breathing glow round it. Frame 0 of an
 * unlit icon is the critter alone.
 */
export function trayFrames(store: ArtStore, critter: Critter, glow: Glow | null): Uint8Array[] {
  const placed = store.avatarLayers({ kind: critter.species, look: lookOf(critter), size: FACE });
  const tint = store.avatarTint(critter.species, critter.coat);
  const frames = glow === null ? 1 : GLOW_FRAMES;
  const out: Uint8Array[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const surface = Skia.Surface.MakeOffscreen(ICON, ICON) ?? Skia.Surface.Make(ICON, ICON);
    if (!surface) break;
    const canvas = surface.getCanvas();
    const c = ICON / 2;
    if (glow !== null) {
      const [r, g, b] = LIGHT[glow];
      const a = glowAt(frame) * 0.8;
      const paint = Skia.Paint();
      paint.setShader(
        Skia.Shader.MakeRadialGradient(
          vec(c, c),
          c,
          [Skia.Color(`rgba(${r},${g},${b},${a})`), Skia.Color(`rgba(${r},${g},${b},0)`)],
          [0.45, 1],
          TileMode.Clamp,
        ),
      );
      canvas.drawCircle(c, c, c, paint);
    }
    const face = Skia.Path.Make();
    face.addCircle(c, c, FACE / 2);
    const fill = Skia.Paint();
    fill.setColor(Skia.Color(tint));
    canvas.drawPath(face, fill);
    canvas.save();
    canvas.clipPath(face, 1, true);
    const at = (ICON - FACE) / 2;
    for (const layer of placed) {
      if (!layer.image) continue;
      canvas.drawImageRect(
        layer.image,
        Skia.XYWHRect(0, 0, layer.image.width(), layer.image.height()),
        Skia.XYWHRect(at + layer.x, at + layer.y, layer.w, layer.h),
        Skia.Paint(),
      );
    }
    canvas.restore();
    surface.flush();
    const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG, 100);
    surface.dispose?.();
    if (bytes.length > 0) out.push(bytes);
  }
  return out;
}
