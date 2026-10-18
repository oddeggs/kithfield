import type { SceneAttrs } from '@kithfield/art';
import { Canvas, Image } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { useReduceMotion } from '../motion/reduce-motion';
import { useArtLoop, useArtStill } from './art-provider';
import type { ViewStyleProp } from '../style';

export interface ArtViewProps {
  /** A scene of the design's renderer (`icon`, `seed`, `writing`, `strip`…). */
  readonly scene: string;
  readonly width: number;
  readonly height: number;
  readonly attrs?: SceneAttrs;
  /** Scene time of the still, in seconds. */
  readonly t?: number;
  readonly style?: ViewStyleProp;
}

/** A scene drawn once and shown as an image: icons, spots, the seed on a plan card. */
export function ArtStill({ scene, width, height, attrs, t = 0, style }: ArtViewProps) {
  const image = useArtStill({ scene, width, height, ...(attrs ? { attrs } : {}) }, t);
  return (
    <View style={[{ width, height }, style]} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <Image image={image} x={0} y={0} width={width} height={height} />
      </Canvas>
    </View>
  );
}

/** One of the design's icons (`01 Foundations`, Icons): mono icons take `color`. */
export function ArtIcon({
  name,
  size,
  color,
  style,
}: {
  readonly name: string;
  readonly size: number;
  readonly color: string;
  readonly style?: ViewStyleProp;
}) {
  return (
    <ArtStill
      scene="icon"
      width={size}
      height={size}
      attrs={{ name, color }}
      {...(style ? { style } : {})}
    />
  );
}

/** The scene time the design's renderer draws a still element at. */
const STILL_T = 1.2;

/**
 * A small animated scene on twos: its frames are drawn once, and one image switches between them
 * on the UI thread. Still on its first frame under Reduce Motion or while `paused`.
 */
export function ArtLoop({
  scene,
  width,
  height,
  attrs,
  style,
  paused = false,
}: ArtViewProps & { readonly paused?: boolean }) {
  const reduce = useReduceMotion();
  const req = { scene, width, height, ...(attrs ? { attrs } : {}) };
  // Held still, the renderer shows the moment a `still` element draws (`kithfield-art.js`).
  const still = useArtStill(req, STILL_T);
  const loop = useArtLoop(req, reduce);
  const elapsed = useSharedValue(0);
  const frames = loop?.frames ?? [];
  const fps = loop?.fps ?? 12;
  const running = !paused && !reduce && frames.length > 1;
  const clock = useFrameCallback((info) => {
    elapsed.set(info.timeSinceFirstFrame);
  }, false);
  useEffect(() => {
    clock.setActive(running);
  }, [clock, running]);
  const image = useDerivedValue(() => {
    const n = frames.length;
    if (n === 0) return still;
    return frames[Math.floor((elapsed.get() / 1000) * fps) % n] ?? still;
  });
  return (
    <View style={[{ width, height }, style]} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <Image image={image} x={0} y={0} width={width} height={height} />
      </Canvas>
    </View>
  );
}
