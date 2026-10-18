import { day, radii, sizes } from '@kithfield/theme';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { shouldDismiss } from '../../../ui/components/sheet-physics';
import { useLocale } from '../../../ui/locale/locale-provider';
import { fadeTo, sheetTo } from '../../../ui/motion/motion';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useGestureRejections } from '../send';

/** How dark the screen under the sheet gets (`05 Gestures`: ink at 30%). */
const SCRIM = 0.3;

export interface OverlaySheetProps {
  /** Inset from the screen's edges, as the + tray floats (8), or 0 for the standard sheet. */
  readonly inset?: number;
  readonly radius?: number;
  /** The sheet's height; it sizes to its content when left out. */
  readonly height?: number;
  readonly closing: boolean;
  readonly onClose: () => void;
  readonly padding?: { top: number; side: number; bottom: number };
  readonly children: ReactNode;
}

/**
 * A sheet over the screen it was opened from: it rises on `motion.sheet` with a scrim fading in
 * under it, follows a downward drag and closes past half its height or on a flick, or on a tap on
 * the scrim. Under Reduce Motion it fades in and out where it rests. It rides up with the keyboard.
 */
export function OverlaySheet({
  inset = 0,
  radius = inset > 0 ? radii.insetSheet : radii.sheet,
  height,
  closing,
  onClose,
  padding = { top: 12, side: 18, bottom: 0 },
  children,
}: OverlaySheetProps) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const screen = useWindowDimensions();
  const keyboard = useAnimatedKeyboard();
  useGestureRejections();
  const measured = useSharedValue(height ?? 0);
  const offset = useSharedValue(screen.height);
  const shown = useSharedValue(0);
  const start = useSharedValue(0);
  const opened = useRef(false);

  const open = (h: number) => {
    measured.set(h);
    if (opened.current) return;
    opened.current = true;
    if (reduce) {
      offset.set(0);
      shown.set(fadeTo(1));
    } else {
      offset.set(h);
      shown.set(fadeTo(1));
      offset.set(sheetTo(0, false));
    }
  };

  useEffect(() => {
    if (!closing) return;
    shown.set(fadeTo(0));
    if (!reduce) offset.set(sheetTo(measured.get() + inset, false));
  }, [closing, reduce, offset, shown, measured, inset]);

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-12, 12],
    onBegin: () => {
      'worklet';
      start.set(offset.get());
    },
    onUpdate: (e) => {
      'worklet';
      const next = start.get() + e.translationY;
      // Upward it gives a little, downward it follows the finger.
      offset.set(next < 0 ? next / 4 : next);
    },
    onDeactivate: (e) => {
      'worklet';
      const h = measured.get();
      if (shouldDismiss([h], h - offset.get(), -e.velocityY)) {
        scheduleOnRN(onClose);
        return;
      }
      offset.set(reduce ? fadeTo(0) : sheetTo(0, false, e.velocityY));
    },
  });

  const sheet = useAnimatedStyle(() => ({
    opacity: reduce ? shown.get() : 1,
    transform: [{ translateY: offset.get() - keyboard.height.get() }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: shown.get() * SCRIM }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.appearance === 'day' ? day.ink : palette.scrim },
          dim,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t('gestures.close')}
          onPress={onClose}
        />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          onLayout={(e) => open(e.nativeEvent.layout.height)}
          style={[
            {
              position: 'absolute',
              left: inset,
              right: inset,
              bottom: inset,
              ...(height === undefined ? {} : { height }),
              borderRadius: radius,
              ...(inset === 0 ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
              backgroundColor: palette.sheet,
              boxShadow: palette.sheetShadow,
              paddingTop: padding.top,
              paddingHorizontal: padding.side,
              paddingBottom: padding.bottom,
              gap: 14,
            },
            sheet,
          ]}
        >
          <View
            style={{
              width: sizes.grabberWidth,
              height: sizes.grabberHeight,
              borderRadius: 3,
              backgroundColor: palette.grabber,
              alignSelf: 'center',
            }}
          />
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
