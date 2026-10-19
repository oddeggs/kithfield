import { day } from '@kithfield/theme';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { androidSystem } from '../../../modules/android-system';
import { useLocale } from '../../ui/locale/locale-provider';
import { fadeTo } from '../../ui/motion/motion';
import { Txt } from '../../ui/type/text';

/*
 * Android 14's predictive back on a chat (`14 Platforms`): as the finger comes in from the
 * edge, a 120-point shade grows along it and, when the chat was opened from the farm, "back to the
 * farm" waits beside the system's own back arrow at the finger's height. Letting go past the edge
 * goes back; letting go before it puts everything away.
 */

/** The shade's width along the edge. */
const SHADE = 120;
/** Where the chip sits: past the system's arrow, as the design places it. */
const CHIP_INSET = 66;
const CHIP_HEIGHT = 30;

/** `day.ink` at an alpha, as the design tints the shade and the chip. */
const ink = (alpha: number) => {
  const hex = day.ink.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
};

/** Whether the screen sits first in its tab's stack: back then leaves for the farm it came from. */
function useFirstInStack(): boolean {
  const navigation = useNavigation();
  const state = navigation.getState();
  return state === undefined || state.index === 0;
}

export function BackPreview({ onBack }: { readonly onBack: () => void }) {
  const { t } = useLocale();
  const toFarm = useFirstInStack();
  const progress = useSharedValue(0);
  const y = useSharedValue(0);
  const right = useSharedValue(0);
  const back = useRef(onBack);
  back.current = onBack;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || androidSystem === null) return undefined;
      const native = androidSystem;
      void native.setBackPreview(true);
      const sub = native.addListener('onBackPreview', (event) => {
        if (event.phase === 'commit') {
          progress.set(fadeTo(0));
          back.current();
          return;
        }
        if (event.phase === 'cancel') {
          progress.set(fadeTo(0));
          return;
        }
        if (event.phase === 'start') right.set(event.edge === 'right' ? 1 : 0);
        progress.set(event.progress);
        y.set(event.y);
      });
      return () => {
        sub.remove();
        void native.setBackPreview(false);
      };
    }, [progress, right, y]),
  );

  const shade = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get() * 3),
    left: right.get() === 1 ? undefined : 0,
    right: right.get() === 1 ? 0 : undefined,
    transform: [{ scaleX: right.get() === 1 ? -1 : 1 }],
  }));
  const marker = useAnimatedStyle(() => {
    const p = Math.min(1, progress.get() * 2.5);
    const shift = (1 - p) * -CHIP_INSET;
    return {
      opacity: p,
      top: y.get() - CHIP_HEIGHT / 2,
      left: right.get() === 1 ? undefined : CHIP_INSET,
      right: right.get() === 1 ? CHIP_INSET : undefined,
      transform: [{ translateX: right.get() === 1 ? -shift : shift }],
    };
  });

  if (Platform.OS !== 'android') return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: SHADE,
            experimental_backgroundImage: `linear-gradient(90deg, ${ink(0.28)}, ${ink(0)})`,
          },
          shade,
        ]}
      />
      <Animated.View
        style={[{ position: 'absolute' }, marker]}
        importantForAccessibility="no-hide-descendants"
      >
        {toFarm ? (
          <View
            style={{
              backgroundColor: ink(0.78),
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Txt variant="handS" color={day.card} style={{ lineHeight: 18 }}>
              {t('android.back.toFarm')}
            </Txt>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}
