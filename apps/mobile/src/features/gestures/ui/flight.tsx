import { motion, travel } from '@kithfield/theme';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ArtIcon } from '../../../ui/art/art-view';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** How long the firefly drifts to its door. */
export const FLIGHT_MS = 1200;
const SIZE = 36;

/**
 * Something leaving your hand along a curve: a firefly drifting to its door, on the UI thread.
 * The path is smooth while the drawing steps on twos (its tilt changes every 83 ms, swinging with
 * the curve, `travel`), and it lands with a small squash. Under Reduce Motion it fades out where it
 * started instead.
 */
export function Flight({
  icon = 'firefly',
  from,
  to,
  onLanded,
}: {
  readonly icon?: string;
  readonly from: Point;
  readonly to: Point;
  readonly onLanded: () => void;
}) {
  const reduce = useReduceMotion();
  const { palette } = useTheme();
  const p = useSharedValue(0);
  const fade = useSharedValue(1);
  useEffect(() => {
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(onLanded);
    };
    if (reduce) {
      fade.set(
        withTiming(0, { duration: motion.fade.durationMs, reduceMotion: ReduceMotion.Never }, done),
      );
    } else {
      p.set(
        withTiming(
          1,
          {
            duration: FLIGHT_MS,
            easing: Easing.bezier(...motion.fade.bezier),
            reduceMotion: ReduceMotion.Never,
          },
          done,
        ),
      );
    }
  }, [reduce, p, fade, onLanded]);

  const style = useAnimatedStyle(() => {
    const t = p.get();
    // A quadratic curve rising above the straight line, so it floats rather than slides.
    const cx = (from.x + to.x) / 2;
    const cy = Math.min(from.y, to.y) - 120;
    const u = 1 - t;
    const x = u * u * from.x + 2 * u * t * cx + t * t * to.x;
    const y = u * u * from.y + 2 * u * t * cy + t * t * to.y;
    // On twos: the tilt changes every other frame of 24, never continuously.
    const step = Math.floor((t * FLIGHT_MS) / travel.drawingSwapMs);
    const swing = step % 2 === 0 ? travel.wobbleMinDeg : -travel.wobbleMaxDeg;
    const landing = t > 0.96 ? 1 - travel.landingSquash : 1;
    return {
      opacity: fade.get(),
      transform: [
        { translateX: x - SIZE / 2 },
        { translateY: y - SIZE / 2 },
        { rotate: `${t >= 1 ? 0 : swing}deg` },
        { scaleY: landing },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
        <ArtIcon name={icon} size={SIZE} color={palette.text} />
      </Animated.View>
    </Animated.View>
  );
}
