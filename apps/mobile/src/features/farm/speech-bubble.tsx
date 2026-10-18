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

import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import type { ViewStyleProp } from '../../ui/style';
import { overArt } from './over-art';

/** Bubbles bob 2 points on a 3-second loop. */
const BOB = 2;
const BOB_MS = 3000;

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
  /** Whether the bob runs: off on a hidden screen and under Reduce Motion. */
  readonly running: boolean;
  /** Where in the loop it starts, 0–1, so neighbours don't bob in step. */
  readonly phase?: number;
  readonly style?: ViewStyleProp;
}) {
  const { appearance } = useTheme();
  const bob = useBob(running, phase);
  const bg = mine ? overArt.ink : appearance === 'night' ? overArt.paperNight : overArt.paper;
  const fg = mine ? overArt.inkFg : overArt.ink;
  const r = 14;
  return (
    <Animated.View style={[{ position: 'absolute' }, style, bob]} pointerEvents="none">
      <View
        style={{
          maxWidth,
          paddingTop: 6,
          paddingBottom: 7,
          paddingHorizontal: 11,
          backgroundColor: bg,
          borderRadius: r,
          borderBottomLeftRadius: tail === 'left' ? 4 : r,
          borderBottomRightRadius: tail === 'right' ? 4 : r,
          boxShadow: overArt.shadow,
        }}
      >
        <Txt variant="handS" multiline color={fg} style={{ lineHeight: 16.5 }}>
          {text}
        </Txt>
        {meta ? (
          <Txt
            variant="bubbleState"
            color={fg}
            style={{ opacity: 0.7, marginTop: 4, fontSize: 10 }}
          >
            {meta}
          </Txt>
        ) : null}
      </View>
    </Animated.View>
  );
}
