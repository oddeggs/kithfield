import { sampleCurves } from '@kithfield/theme';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo } from '../../motion/motion';
import { Press } from '../../motion/press';
import { useReduceMotion } from '../../motion/reduce-motion';
import { useTheme } from '../../theme/theme-provider';
import { TravelAnchor } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { timing } from '../timings';
import { LabNotes, LabStage, STAGE_W, useLabFlight } from './kit';

const H = 600;
/** Where the farm scene draws its fire ring, as a share of the scene (`S.farm`). */
const RING = { x: 0.2, y: 0.87 };
const FLAME = 120;
/** The flame in the fire room's middle (`S.fire2` draws its fire low in the circle). */
const FLAME_BOX = {
  x: STAGE_W / 2 - FLAME / 2,
  y: H * 0.62 - FLAME / 2,
  width: FLAME,
  height: FLAME,
};
/** The Dynamic Island on the window (iPhone 16): the flame shrinks up into it. */
const ISLAND = { x: (STAGE_W - 126) / 2, y: 11, width: 126, height: 37 };
const ROOM = 'mole:talk:joy,sheep:mute:,owl:listen:,rabbit:mute:';
const flameArt: SpriteSpec = { fire: FLAME };
const zoomIn = timing('fire', 'in');
const zoomOut = timing('fire', 'out');

/**
 * The fire: the farm accelerates into its fire ring and the room opens; going home, the flame
 * shrinks up into the Dynamic Island, and tapping the island zooms back in from it.
 */
export function FireDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const { go, current } = useLabFlight();
  const [at, setAt] = useState<'farm' | 'fire' | 'island'>('farm');
  const zoom = useSharedValue(0);
  const room = useSharedValue(0);
  const ease = Easing.bezier(...sampleCurves.fireZoom);
  const farmStyle = useAnimatedStyle(() => ({
    opacity: 1 - room.get(),
    transform: [
      { translateX: STAGE_W * RING.x },
      { translateY: H * RING.y },
      { scale: 1 + zoom.get() * 2.2 },
      { translateX: -STAGE_W * RING.x },
      { translateY: -H * RING.y },
    ],
  }));
  const roomStyle = useAnimatedStyle(() => ({ opacity: room.get() }));

  const toFire = (from: 'farm' | 'island') => {
    if (current.current) return;
    setAt('fire');
    if (from === 'farm') {
      zoom.set(
        reduce
          ? 0
          : withTiming(1, { duration: zoomIn, easing: ease, reduceMotion: ReduceMotion.Never }),
      );
      room.set(fadeTo(1));
      return;
    }
    room.set(fadeTo(1));
    go({
      from: ISLAND,
      to: 'lab:flame',
      sprite: flameArt,
      fromWidth: 24,
      arc: 30,
      durationMs: zoomIn,
    });
  };

  const home = () => {
    if (at !== 'fire' || current.current) return;
    setAt('island');
    room.set(fadeTo(0));
    zoom.set(fadeTo(0));
    go({
      from: 'lab:flame',
      to: ISLAND,
      sprite: flameArt,
      toWidth: 24,
      arc: 30,
      fade: 'out',
      durationMs: zoomOut,
    });
  };

  return (
    <View>
      <LabStage height={H} background={palette.firefly.bg}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, farmStyle]}>
          <ArtStill
            scene="farm"
            width={STAGE_W}
            height={H}
            attrs={{ state: 'fire', season: 'autumn' }}
          />
          <Press
            onPress={() => toFire('farm')}
            darken={false}
            accessibilityLabel={t('motionLab.fire')}
            style={{
              position: 'absolute',
              left: STAGE_W * RING.x - 40,
              top: H * RING.y - 40,
              width: 80,
              height: 80,
            }}
          />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, top: 0 }, roomStyle]}
        >
          <ArtStill scene="fire2" width={STAGE_W} height={H} attrs={{ items: ROOM }} />
          <TravelAnchor
            id="lab:flame"
            style={{
              position: 'absolute',
              left: FLAME_BOX.x,
              top: FLAME_BOX.y,
              width: FLAME,
              height: FLAME,
            }}
          />
        </Animated.View>
      </LabStage>
      <LabNotes
        hint={t('motionLab.fire.hint')}
        actions={[
          { label: t('motionLab.fire.home'), onPress: home },
          {
            label: t('motionLab.back'),
            onPress: () => (at === 'island' ? toFire('island') : undefined),
          },
        ]}
      />
    </View>
  );
}
