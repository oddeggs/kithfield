import type { SceneAttrs } from '@kithfield/art';

import { useArt } from '../../ui/art/art-provider';
import { ArtLoop, ArtStill } from '../../ui/art/art-view';
import type { ViewStyleProp } from '../../ui/style';

/** Frames in a scene loop on twos (`motion.twos`). */
const LOOP_FRAMES = 12;
/** The scene time the renderer draws a still element at. */
const STILL_T = 1.2;

/**
 * A way-in scene: on twos when its loop fits the art's cache (the critter stages, the spots, the
 * rose), held still where a full-width loop would not (the gate, the welcome, the invite meadow).
 */
export function SceneArt({
  scene,
  width,
  height,
  attrs,
  style,
  t = STILL_T,
}: {
  readonly scene: string;
  readonly width: number;
  readonly height: number;
  readonly attrs?: SceneAttrs;
  readonly style?: ViewStyleProp;
  /** Scene time of the still, where the design's moment differs from the renderer's own. */
  readonly t?: number;
}) {
  const store = useArt();
  const bytes = Math.round(width * store.dpr) * Math.round(height * store.dpr) * 4 * LOOP_FRAMES;
  const fits = bytes <= store.art.cache.cap / 4;
  const props = { scene, width, height, ...(attrs ? { attrs } : {}), ...(style ? { style } : {}) };
  return fits ? <ArtLoop {...props} /> : <ArtStill {...props} t={t} />;
}
