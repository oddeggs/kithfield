import { motion } from '@kithfield/theme';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ArtLoop, ArtStill } from '../../ui/art/art-view';
import { fadeTo } from '../../ui/motion/motion';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import type { ViewStyleProp } from '../../ui/style';
import type { SeedStage } from './plan-status';

/** How far the seed tips each way as it changes stage, in degrees. */
const WIGGLE_DEG = 4;

/**
 * A plan's seed at its stage, on its tile. A new stage swaps the drawing on held frames with a
 * two-drawing wiggle (tip one way, then the other, each held for one drawing on twos), on the UI
 * thread; under Reduce Motion the new stage fades in instead. A sprouted seed's glints twinkle.
 */
export function SeedArt({
  stage,
  size,
  tile,
  radius = 0,
  dim = false,
  twinkle = false,
  style,
}: {
  readonly stage: SeedStage;
  readonly size: number;
  /** The tile colour behind the seed, or none. */
  readonly tile?: string;
  readonly radius?: number;
  /** A resting "someday" seed, faded on its tile. */
  readonly dim?: boolean;
  /** Let a bloom's glints twinkle (a loop on twos). */
  readonly twinkle?: boolean;
  readonly style?: ViewStyleProp;
}) {
  const reduce = useReduceMotion();
  const tilt = useSharedValue(0);
  const shown = useSharedValue(1);
  const last = useRef(stage);
  useEffect(() => {
    if (last.current === stage) return;
    last.current = stage;
    if (reduce) {
      shown.set(0);
      shown.set(fadeTo(1));
      return;
    }
    const hold = motion.twos.frameMs;
    tilt.set(
      withSequence(
        withTiming(-WIGGLE_DEG, { duration: 0 }),
        withDelay(hold, withTiming(WIGGLE_DEG, { duration: 0 })),
        withDelay(hold, withTiming(0, { duration: 0 })),
      ),
    );
  }, [stage, reduce, tilt, shown]);
  const moving = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ rotate: `${tilt.get()}deg` }],
  }));
  const art =
    twinkle && stage === 3 ? (
      <ArtLoop scene="seed" width={size} height={size} attrs={{ stage }} />
    ) : (
      <ArtStill scene="seed" width={size} height={size} attrs={{ stage }} />
    );
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size, borderRadius: radius, overflow: 'hidden' },
        tile ? { backgroundColor: tile } : null,
        dim ? { opacity: 0.75 } : null,
        style,
      ]}
    >
      <Animated.View style={moving}>{art}</Animated.View>
    </View>
  );
}
