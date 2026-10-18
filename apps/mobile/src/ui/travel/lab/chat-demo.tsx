import { radii } from '@kithfield/theme';
import { useRef } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { sheetTo } from '../../motion/motion';
import { useReduceMotion } from '../../motion/reduce-motion';
import { useTheme } from '../../theme/theme-provider';
import { Txt } from '../../type/text';
import { timing } from '../timings';
import { useTravel, type FlightHandle } from '../travel-host';
import { BlankBubble, poseOf, StandingCritter } from './kit';

const STAGE_H = 600;
const FARM_H = 430;
const STRIP_H = 236;
/** The sheet rests overlapping the farm by 40, and rises to the strip's bottom. */
const LOW = FARM_H - 40;
const HIGH = STRIP_H - 16;
const RANGE = LOW - HIGH;
const ON_FARM = 100;
const IN_STRIP = 84;
/** Who lives here: where each stands on the farm, and their place in the strip's line. */
const CAST = [
  { kind: 'sheep', farm: { x: 70, y: 345 }, strip: 0.22 },
  { kind: 'mole', farm: { x: 195, y: 362 }, strip: 0.37 },
  { kind: 'frog', farm: { x: 150, y: 410 }, strip: 0.66 },
  { kind: 'rabbit', farm: { x: 310, y: 395 }, strip: 0.82 },
] as const;
const eachWay = timing('farmToChat', 'eachWay');

const farmId = (kind: string) => `lab:farm:${kind}`;
const stripId = (kind: string) => `lab:strip:${kind}`;

/**
 * Farm home ↔ chat, under the finger: dragging the sheet up lifts each critter off the farm and
 * carries it into its place in the chat header while the farm cross-fades to the strip; dragging
 * down carries them home. Letting go settles at the nearer end with the finger's speed.
 */
export function ChatDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const { fly } = useTravel();
  // 0: the farm home with its sheet low; 1: the chat with its header.
  const open = useSharedValue(0);
  const start = useSharedValue(0);
  const home = useDerivedValue(() => 1 - open.get());
  const flights = useRef<FlightHandle[]>([]);

  const lift = (up: boolean) => {
    flights.current = CAST.map((c, i) =>
      fly({
        from: up ? farmId(c.kind) : stripId(c.kind),
        to: up ? stripId(c.kind) : farmId(c.kind),
        sprite: poseOf(c.kind, up ? ON_FARM : IN_STRIP),
        fit: 1,
        arc: 30 + i * 6,
        durationMs: eachWay,
        drive: up ? open : home,
      }),
    );
  };
  const letGo = (forward: boolean, rate: number) => {
    for (const f of flights.current) f.release(forward, rate);
    flights.current = [];
  };

  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      start.set(open.get());
      scheduleOnRN(lift, open.get() < 0.5);
    },
    onUpdate: (e) => {
      'worklet';
      open.set(Math.min(1, Math.max(0, start.get() - e.translationY / RANGE)));
    },
    onDeactivate: (e) => {
      'worklet';
      const rate = -e.velocityY / RANGE;
      const up = start.get() < 0.5;
      const to = Math.abs(rate) > 1.2 ? (rate > 0 ? 1 : 0) : open.get() > 0.5 ? 1 : 0;
      open.set(sheetTo(to, reduce, rate));
      // A flight that set out upward lands when the sheet ends up; one going home, when it ends down.
      scheduleOnRN(letGo, up ? to === 1 : to === 0, up ? rate : -rate);
    },
  });

  const farmStyle = useAnimatedStyle(() => ({ opacity: 1 - open.get() }));
  const stripStyle = useAnimatedStyle(() => ({ opacity: open.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: LOW - open.get() * RANGE }],
  }));
  const bubblesStyle = useAnimatedStyle(() => ({ opacity: open.get() }));

  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: STAGE_H, overflow: 'hidden' }}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, farmStyle]}>
          <ArtStill scene="farm" width={393} height={FARM_H} attrs={{ state: 'nocast' }} />
          {CAST.map((c) => (
            <StandingCritter
              key={c.kind}
              id={farmId(c.kind)}
              kind={c.kind}
              x={c.farm.x}
              y={c.farm.y}
              size={ON_FARM}
            />
          ))}
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, stripStyle]}>
          <ArtStill scene="strip" width={393} height={STRIP_H} attrs={{ state: 'nocast' }} />
          {CAST.map((c) => (
            <StandingCritter
              key={c.kind}
              id={stripId(c.kind)}
              kind={c.kind}
              x={393 * c.strip}
              y={STRIP_H * 0.87}
              size={IN_STRIP}
            />
          ))}
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: STAGE_H,
                backgroundColor: palette.background,
                borderTopLeftRadius: radii.sheet,
                borderTopRightRadius: radii.sheet,
                boxShadow: palette.sheetShadow,
                paddingTop: 8,
                paddingHorizontal: 14,
                gap: 14,
              },
              sheetStyle,
            ]}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 5,
                borderRadius: 3,
                backgroundColor: palette.grabber,
              }}
            />
            <Animated.View style={[{ gap: 14 }, bubblesStyle]}>
              <BlankBubble width={220} />
              <BlankBubble width={170} />
              <BlankBubble width={240} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Txt variant="note" multiline color={palette.secondary}>
          {t('motionLab.chat.hint')}
        </Txt>
      </View>
    </View>
  );
}
