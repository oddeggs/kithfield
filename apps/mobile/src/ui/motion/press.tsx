import { press } from '@kithfield/theme';
import type { ReactNode } from 'react';
import type { AccessibilityProps } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  useLongPressGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics, type Haptic } from './haptics';
import { pressTo } from './motion';
import { useReduceMotion } from './reduce-motion';
import type { ViewStyleProp } from '../style';

export interface PressProps extends AccessibilityProps {
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  /** A haptic to play as the press lands (see `haptics`). */
  readonly haptic?: Haptic;
  /** Corner radius of the darkening, so it follows the control's own shape. */
  readonly radius?: number;
  /** Darken by `press.darken`; off for controls with no surface of their own. */
  readonly darken?: boolean;
  readonly disabled?: boolean;
  readonly hitSlop?: number;
  readonly style?: ViewStyleProp;
  readonly children?: ReactNode;
  readonly testID?: string;
}

/**
 * Anything tappable: scales to `press.scale` and darkens by `press.darken` over
 * `press.durationMs`, recognised and animated on the UI thread. Reduce Motion keeps the
 * darkening and drops the scale.
 */
export function Press({
  onPress,
  onLongPress,
  haptic,
  radius = 0,
  darken = true,
  disabled = false,
  hitSlop,
  style,
  children,
  testID,
  ...a11y
}: PressProps) {
  const reduce = useReduceMotion();
  const held = useSharedValue(0);
  const fire = () => {
    if (haptic) haptics[haptic]();
    onPress?.();
  };
  const fireLong = () => {
    haptics.tap();
    onLongPress?.();
  };
  const tap = useTapGesture({
    enabled: !disabled,
    hitSlop,
    onBegin: () => {
      'worklet';
      held.set(pressTo(1));
    },
    onActivate: () => {
      'worklet';
      scheduleOnRN(fire);
    },
    onFinalize: () => {
      'worklet';
      held.set(pressTo(0));
    },
  });
  const long = useLongPressGesture({
    enabled: !disabled && onLongPress !== undefined,
    onActivate: () => {
      'worklet';
      scheduleOnRN(fireLong);
    },
    onFinalize: () => {
      'worklet';
      held.set(pressTo(0));
    },
  });
  const gesture = useExclusiveGestures(long, tap);
  const scaled = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : 1 - (1 - press.scale) * held.get() }],
  }));
  const shade = useAnimatedStyle(() => ({ opacity: press.darken * held.get() }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        {...a11y}
        {...(onPress && !disabled ? { onAccessibilityTap: fire } : {})}
        testID={testID}
        style={[style, scaled]}
      >
        {children}
        {darken ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: radius,
                backgroundColor: '#000',
              },
              shade,
            ]}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
