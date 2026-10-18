import type { LayerOptions, SceneLayers, SceneRequest } from '@kithfield/art';
import {
  BlendMode,
  Canvas,
  Image,
  Picture,
  Skia,
  type SkPicture,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { useReduceMotion } from '../motion/reduce-motion';
import { useArtVisible } from '../motion/visibility';
import { useArt, useArtStill, whenIdle } from './art-provider';
import type { ArtViewProps } from './art-view';

/** The scene time a still is drawn at, and so the first frame of the layers (`kithfield-art.js`). */
const START = 1.2;

/** How a `LayeredScene` bakes, past its scene: see `LayerOptions` in `@kithfield/art`. */
export type LayeredOptions = Pick<LayerOptions, 'tolerance' | 'budget' | 'frames'>;

/**
 * The layers of a full-size scene, baked a frame at a time whenever the JS thread is idle, so
 * neither the screen's first frame nor a touch waits on them. Null while baking, while `held`
 * (Reduce Motion), and for layers over their budget (told once in development: the scene stays
 * still).
 */
export function useSceneLayers(
  req: SceneRequest,
  options: LayeredOptions,
  held: boolean,
): SceneLayers | null {
  const store = useArt();
  const key = JSON.stringify([req, options]);
  const [layers, setLayers] = useState<{ key: string; layers: SceneLayers } | null>(null);
  useEffect(() => {
    if (held) return;
    const bake = store.bakeLayers(req, { ...options, start: START });
    let cancel = () => undefined as void;
    const step = () => {
      const next = bake.next();
      if (!next.done) {
        cancel = whenIdle(step);
        return;
      }
      if (next.value.ok) {
        setLayers({ key, layers: next.value.layers });
        return;
      }
      const mb = (n: number) => (n / 1e6).toFixed(1);
      store.warnOnce(
        `layers:${key}`,
        `${req.scene} (${req.width}×${req.height}): what moves takes ${mb(next.value.bytes)} MB, ` +
          `over its ${mb(next.value.budget)} MB budget, so it is held still. See ui/art/README.md.`,
      );
    };
    cancel = whenIdle(step);
    return () => cancel();
    // `key` stands for `req` and `options`.
  }, [store, key, held]);
  return !held && layers?.key === key ? layers.layers : null;
}

/** Each frame's pieces recorded once, copied (not blended) over the still where they sit. */
function picturesOf(layers: SceneLayers, width: number, height: number): SkPicture[] {
  const paint = Skia.Paint();
  paint.setBlendMode(BlendMode.Src);
  return Array.from({ length: layers.length }, (_, i) => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    for (const p of layers.pieces) {
      const frame = p.frames[i];
      if (!frame) continue;
      canvas.drawImageRect(
        frame,
        Skia.XYWHRect(0, 0, frame.width(), frame.height()),
        Skia.XYWHRect(p.x, p.y, p.width, p.height),
        paint,
      );
    }
    return recorder.finishRecordingAsPicture();
  });
}

/**
 * A full-size scene that animates: the scene drawn once as a still, with only the parts that move
 * looping over it on twos, switched on the UI thread. What moves is found by drawing the loop
 * once (`bakeSceneLayers`), so it needs nothing from the scene's code. Still under Reduce Motion,
 * while `paused`, under a pushed screen, on a hidden tab, in the background, while it bakes, and
 * when what moves is over its budget.
 */
export function LayeredScene({
  scene,
  width,
  height,
  attrs,
  style,
  paused = false,
  tolerance,
  budget,
  frames: length,
}: Omit<ArtViewProps, 't'> & { readonly paused?: boolean } & LayeredOptions) {
  const reduce = useReduceMotion();
  const req = { scene, width, height, ...(attrs ? { attrs } : {}) };
  const options = {
    ...(tolerance !== undefined ? { tolerance } : {}),
    ...(budget !== undefined ? { budget } : {}),
    ...(length !== undefined ? { frames: length } : {}),
  };
  const still = useArtStill(req, START);
  const layers = useSceneLayers(req, options, reduce);
  const pictures = useMemo(
    () => (layers ? picturesOf(layers, width, height) : []),
    [layers, width, height],
  );
  const [first] = pictures;
  return (
    <View style={[{ width, height }, style]} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <Image image={still} x={0} y={0} width={width} height={height} />
        {first && layers ? (
          <Moving
            pictures={pictures}
            first={first}
            fps={layers.fps}
            running={!paused && !reduce && pictures.length > 1}
          />
        ) : null}
      </Canvas>
    </View>
  );
}

/** The frames' pictures, one at a time, on a clock that runs only while the scene is seen. */
function Moving({
  pictures,
  first,
  fps,
  running,
}: {
  readonly pictures: readonly SkPicture[];
  readonly first: SkPicture;
  readonly fps: number;
  readonly running: boolean;
}) {
  const elapsed = useSharedValue(0);
  // Loops stop on a hidden tab, under a pushed screen and in the background.
  const visible = useArtVisible();
  const clock = useFrameCallback((info) => {
    elapsed.set(info.timeSinceFirstFrame);
  }, false);
  useEffect(() => {
    clock.setActive(running && visible);
  }, [clock, running, visible]);
  const picture = useDerivedValue(
    () => pictures[Math.floor((elapsed.get() / 1000) * fps) % pictures.length] ?? first,
  );
  return <Picture picture={picture} />;
}
