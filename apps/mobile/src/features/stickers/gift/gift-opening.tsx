import { motion } from '@kithfield/theme';
import { Canvas, Image, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { useArt, whenIdle } from '../../../ui/art/art-provider';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';

/**
 * The parcel's opening in the art's `gift` scene: the string unties and the lid lifts between
 * these scene times, after which the stickers tumble out. Drawn on twos (12 a second).
 */
const OPEN_FROM = 0.85;
const OPEN_TO = 1.75;
const FPS = motion.twos.fps;

/**
 * The gift opening once, then held open. The drawings are made when the JS thread is idle, one
 * at a time, and played on the UI thread; Reduce Motion shows it open.
 */
export function GiftOpening({
  width,
  height,
  color,
}: {
  readonly width: number;
  readonly height: number;
  readonly color: string;
}) {
  const store = useArt();
  const reduce = useReduceMotion();
  const [frames, setFrames] = useState<readonly SkImage[]>([]);
  const progress = useSharedValue(0);

  useEffect(() => {
    const req = { scene: 'gift', width, height, attrs: { color } };
    const times = reduce
      ? [OPEN_TO]
      : Array.from(
          { length: Math.round((OPEN_TO - OPEN_FROM) * FPS) + 1 },
          (_, i) => OPEN_FROM + i / FPS,
        );
    const drawn: SkImage[] = [];
    let cancel = () => undefined as void;
    const step = (i: number) => {
      cancel = whenIdle(() => {
        const image = store.still(req, times[i] ?? OPEN_TO);
        if (image) drawn.push(image);
        if (i + 1 < times.length) step(i + 1);
        else setFrames(drawn);
      });
    };
    step(0);
    return () => cancel();
  }, [store, width, height, color, reduce]);

  useEffect(() => {
    if (frames.length < 2) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: (frames.length / FPS) * 1000, easing: Easing.linear }));
  }, [frames, progress]);

  const image = useDerivedValue(() => {
    const n = frames.length;
    if (n === 0) return null;
    return frames[Math.min(n - 1, Math.floor(progress.get() * n))] ?? null;
  });

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <Image image={image} x={0} y={0} width={width} height={height} />
      </Canvas>
    </View>
  );
}
