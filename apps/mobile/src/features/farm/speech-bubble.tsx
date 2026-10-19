import { farm } from '@kithfield/theme';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import type { ViewStyleProp } from '../../ui/style';
import { BUBBLE_MAX_SCALE } from './bubble-layout';
import { overArt } from './over-art';
import { typeAt } from './type-at';

/** Bubbles bob 2 points on a 3-second loop. */
const BOB = farm.bob.distance;
const BOB_MS = farm.bob.periodMs;

/** A gentle bob of 2 points on a 3-second loop, while `running` and Reduce Motion is off. */
export function useBob(running: boolean, phase = 0) {
  const reduce = useReduceMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!running || reduce) {
      cancelAnimation(y);
      y.set(0);
      return;
    }
    const start = setTimeout(() => {
      y.set(
        withRepeat(
          withTiming(-BOB, {
            duration: BOB_MS / 2,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.Never,
          }),
          -1,
          true,
        ),
      );
    }, phase * BOB_MS);
    return () => {
      clearTimeout(start);
      cancelAnimation(y);
    };
  }, [running, reduce, phase, y]);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return bob;
}

/**
 * A hand-lettered bubble over the farm: a critter's status, a dozing friend, a plan's flag. Its
 * tail corner sits toward what it speaks for (`tail`). `mine` is the person's own, in ink.
 */
export function SpeechBubble({
  text,
  meta,
  tail = 'left',
  mine = false,
  maxWidth,
  width,
  running,
  phase = 0,
  style,
}: {
  readonly text: string;
  /** A small line under the words: "yours · 23h left". */
  readonly meta?: string;
  readonly tail?: 'left' | 'right';
  readonly mine?: boolean;
  readonly maxWidth?: number;
  /** The width the farm's layout gave it, so it takes no more room than was kept for it. */
  readonly width?: number;
  /** Whether the bob runs: off on a hidden screen and under Reduce Motion. */
  readonly running: boolean;
  /** Where in the loop it starts, 0–1, so neighbours don't bob in step. */
  readonly phase?: number;
  readonly style?: ViewStyleProp;
}) {
  const { appearance } = useTheme();
  const { fontLocale } = useLocale();
  const bob = useBob(running, phase);
  const bg = mine ? overArt.ink : appearance === 'night' ? overArt.paperNight : overArt.paper;
  const fg = mine ? overArt.inkFg : overArt.ink;
  const r = 14;
  return (
    <Animated.View style={[{ position: 'absolute' }, style, bob]} pointerEvents="none">
      <View
        style={{
          maxWidth,
          width,
          paddingTop: 6,
          paddingBottom: 7,
          paddingHorizontal: 11,
          backgroundColor: bg,
          borderRadius: r,
          borderBottomLeftRadius: tail === 'left' ? 4 : r,
          borderBottomRightRadius: tail === 'right' ? 4 : r,
          boxShadow: farm.shadows.bubble,
        }}
      >
        <Txt
          variant="handS"
          multiline
          color={fg}
          maxFontSizeMultiplier={BUBBLE_MAX_SCALE}
          style={typeAt('handS', 15, 16.5, fontLocale)}
        >
          {text}
        </Txt>
        {meta ? (
          <Txt
            variant="bubbleState"
            color={fg}
            maxFontSizeMultiplier={BUBBLE_MAX_SCALE}
            style={{ opacity: 0.7, marginTop: 4, fontSize: 10 }}
          >
            {meta}
          </Txt>
        ) : null}
      </View>
    </Animated.View>
  );
}
