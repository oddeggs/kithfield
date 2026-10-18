import { layout, radii, sizes } from '@kithfield/theme';
import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useLocale } from '../locale/locale-provider';
import { haptics } from '../motion/haptics';
import { fadeTo, sheetTo } from '../motion/motion';
import { useReduceMotion } from '../motion/reduce-motion';
import { useTheme } from '../theme/theme-provider';
import { rubberBand, settleIndex, shouldDismiss } from './sheet-physics';

const OVERSHOOT = 40;

export interface SheetProps {
  /** Heights the sheet rests at, in points above the bottom edge, lowest first. */
  readonly detents: readonly number[];
  /** The stop it shows at. A modal sheet closes when this becomes -1. */
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  /** Over a dimmed screen, closed by pulling it down, tapping outside or the escape gesture. */
  readonly modal?: boolean;
  readonly children: ReactNode;
}

/**
 * The standard sheet (`01 Foundations`): 30 radius, grabber, 18 side padding, the sheet shadow.
 * It follows the finger and springs to its stops with `motion.sheet`, carrying the release's
 * velocity; under Reduce Motion it fades open and shut and moves between stops with `motion.fade`.
 */
export function Sheet({ detents, index, onIndexChange, modal = false, children }: SheetProps) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const top = detents[detents.length - 1] ?? 0;
  const target = index < 0 ? 0 : (detents[index] ?? 0);
  const height = useSharedValue(reduce ? target : 0);
  const shown = useSharedValue(reduce && index < 0 ? 0 : 1);
  const start = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      if (index < 0) {
        shown.set(
          fadeTo(0, () => {
            'worklet';
            height.set(0);
          }),
        );
      } else {
        // Opening fades in where it will rest; moving between stops eases there.
        if (shown.get() === 0 || height.get() === 0) {
          height.set(target);
          shown.set(fadeTo(1));
        } else {
          height.set(fadeTo(target));
        }
      }
    } else {
      shown.set(1);
      height.set(sheetTo(target, false));
    }
  }, [target, index, reduce, height, shown]);

  const settle = (next: number) => {
    if (next !== index) {
      haptics.select();
      onIndexChange(next);
    }
  };

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      start.set(height.get());
    },
    onUpdate: (e) => {
      'worklet';
      height.set(rubberBand(detents, start.get() - e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      const h = height.get();
      const v = -e.velocityY;
      if (modal && shouldDismiss(detents, h, v)) {
        scheduleOnRN(onIndexChange, -1);
        return;
      }
      const next = settleIndex(detents, h, v);
      const to = detents[next] ?? 0;
      height.set(reduce ? fadeTo(to) : sheetTo(to, false, v));
      scheduleOnRN(settle, next);
    },
  });

  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: top - height.get() }],
    opacity: shown.get(),
  }));
  const dim = useAnimatedStyle(() => ({
    opacity: shown.get() * Math.min(1, height.get() / Math.max(1, detents[0] ?? 1)) * 0.3,
  }));

  const adjust = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'increment') settle(Math.min(detents.length - 1, index + 1));
    if (name === 'decrement') settle(modal && index === 0 ? -1 : Math.max(0, index - 1));
  };
  const closed = index < 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={closed ? 'none' : 'box-none'}>
      {modal ? (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, dim]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel={t('shell.sheet.close')}
            accessibilityRole="button"
            onPress={() => onIndexChange(-1)}
          />
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityViewIsModal={modal}
          onAccessibilityEscape={modal ? () => onIndexChange(-1) : undefined}
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              // Taller than its highest stop, so a spring's overshoot never shows a gap below.
              bottom: -OVERSHOOT,
              height: top + OVERSHOOT,
              paddingBottom: OVERSHOOT,
              backgroundColor: palette.sheet,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
              boxShadow: palette.sheetShadow,
              paddingHorizontal: layout.sheetPadding,
              paddingTop: 10,
              gap: 8,
            },
            sheet,
          ]}
        >
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t('shell.sheet.handle')}
            accessibilityHint={t('shell.sheet.handleHint')}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={adjust}
            style={{ alignSelf: 'center', paddingHorizontal: 20 }}
          >
            <View
              style={{
                width: sizes.grabberWidth,
                height: sizes.grabberHeight,
                borderRadius: 3,
                backgroundColor: palette.grabber,
              }}
            />
          </View>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
