import type { SceneAttrs } from '@kithfield/art';

import { useArt } from '../../ui/art/art-provider';
import { ArtLoop, ArtStill } from '../../ui/art/art-view';
import { LayeredScene } from '../../ui/art/layered-scene';
import type { ViewStyleProp } from '../../ui/style';

/** Frames in a scene loop on twos (`motion.twos`). */
const LOOP_FRAMES = 12;

/**
 * A way-in scene on twos: the whole loop when it fits the art's cache (the critter stages, the
 * rose), else a still with only what moves looping over it (the gate, the spots, the invite
 * meadow). A screen that holds the design's one moment passes `t` and gets that still.
 */
export function SceneArt({
  scene,
  width,
  height,
  attrs,
  style,
  t,
}: {
  readonly scene: string;
  readonly width: number;
  readonly height: number;
  readonly attrs?: SceneAttrs;
  readonly style?: ViewStyleProp;
  /** Holds the scene still at this time, where the design draws one moment and no motion. */
  readonly t?: number;
}) {
  const store = useArt();
  const bytes = Math.round(width * store.dpr) * Math.round(height * store.dpr) * 4 * LOOP_FRAMES;
  const fits = bytes <= store.art.cache.cap / 4;
  const props = { scene, width, height, ...(attrs ? { attrs } : {}), ...(style ? { style } : {}) };
  if (t !== undefined) return <ArtStill {...props} t={t} />;
  return fits ? <ArtLoop {...props} /> : <LayeredScene {...props} />;
}
