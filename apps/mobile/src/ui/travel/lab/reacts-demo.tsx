import { motion } from '@kithfield/theme';
import { useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo, sheetTo } from '../../motion/motion';
import { useReduceMotion } from '../../motion/reduce-motion';
import { useTheme } from '../../theme/theme-provider';
import { Txt } from '../../type/text';
import { LabNotes, LabStage, STAGE_W } from './kit';

const H = 600;
const BEFORE = 'rabbit,hedgehog';
const AFTER = 'rabbit,hedgehog,sheep';
/** Where the sheep's cottage sits on the farm scene, for the bubble above it. */
const ABOVE = { x: STAGE_W * 0.6, y: H * 0.25 };
/** Messages in a burst make one lamp and one bubble, this often at most. */
const COALESCE_MS = 4000;
const SHOWN_MS = 2600;
const instant = (to: number) => withTiming(to, { duration: 0, reduceMotion: ReduceMotion.Never });

/**
 * The farm reacts to a message: the sender's lamp lights in two drawings, and a bubble pops above
 * their cottage. A burst of messages makes one lamp and one bubble every 4 s at most. Under
 * Reduce Motion only the lamp lights.
 */
export function ReactsDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const last = useRef(0);
  const lamp = useSharedValue(0);
  const bubble = useSharedValue(0);
  const litStyle = useAnimatedStyle(() => ({ opacity: lamp.get() }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, bubble.get()),
    transform: [{ scale: 0.2 + 0.8 * bubble.get() }],
  }));

  const arrive = () => {
    const now = Date.now();
    if (now - last.current < COALESCE_MS) return;
    last.current = now;
    // Two drawings on twos: a flicker on, then lit.
    lamp.set(
      reduce
        ? fadeTo(1)
        : withSequence(
            instant(1),
            withDelay(motion.twos.frameMs, instant(0.6)),
            withDelay(motion.twos.frameMs, instant(1)),
          ),
    );
    if (reduce) return;
    bubble.set(sheetTo(1, false));
    setTimeout(() => bubble.set(fadeTo(0)), SHOWN_MS);
    // The lab puts the lamp out again after a while, to play it once more.
    setTimeout(() => lamp.set(fadeTo(0)), COALESCE_MS * 2);
  };

  return (
    <View>
      <LabStage height={H} background={palette.firefly.bg}>
        <ArtStill scene="farm" width={STAGE_W} height={H} attrs={{ night: true, lit: BEFORE }} />
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, litStyle]}>
          <ArtStill scene="farm" width={STAGE_W} height={H} attrs={{ night: true, lit: AFTER }} />
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: ABOVE.x,
              top: ABOVE.y,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 14,
              borderBottomLeftRadius: 4,
              backgroundColor: 'rgba(251,247,240,0.96)',
              transformOrigin: 'left bottom',
            },
            bubbleStyle,
          ]}
        >
          <Txt variant="handS">{t('motionLab.reacts.message')}</Txt>
        </Animated.View>
      </LabStage>
      <LabNotes
        hint={t('motionLab.reacts.hint')}
        actions={[{ label: t('motionLab.reacts.go'), onPress: arrive }]}
      />
    </View>
  );
}
