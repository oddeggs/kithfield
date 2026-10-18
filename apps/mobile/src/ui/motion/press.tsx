import { press } from '@kithfield/theme';
import { useCallback, useRef, type ReactNode } from 'react';
import type { AccessibilityActionEvent, AccessibilityProps, Insets, ViewProps } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  useLongPressGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ViewStyleProp } from '../style';
import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { haptics, type Haptic } from './haptics';
import { pressTo } from './motion';
import { useReduceMotion } from './reduce-motion';

export interface PressProps
  extends
    AccessibilityProps,
    Pick<ViewProps, 'accessibilityShowsLargeContentViewer' | 'accessibilityLargeContentTitle'> {
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  /** A haptic to play as the press lands (see `haptics`). */
  readonly haptic?: Haptic;
  /** Corner radius of the darkening, so it follows the control's own shape. */
  readonly radius?: number;
  /** Darken by `press.darken`; off for controls with no surface of their own. */
  readonly darken?: boolean;
  readonly disabled?: boolean;
  /** How far past its edges the control still takes a touch: to reach 44 points. */
  readonly hitSlop?: number | Insets;
  readonly style?: ViewStyleProp;
  readonly children?: ReactNode;
  readonly testID?: string;
}

/**
 * Anything tappable: scales to `press.scale` and darkens by `press.darken` over
 * `press.durationMs`, recognised and animated on the UI thread. Reduce Motion keeps the
 * darkening and drops the scale. VoiceOver activates it, and long-presses it, through actions.
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
  const { palette } = useTheme();
  const { t } = useLocale();
  const held = useSharedValue(0);
  // The gestures keep one callback each; the latest handlers are read when they fire.
  const latest = useRef({ onPress, onLongPress, haptic });
  latest.current = { onPress, onLongPress, haptic };
  const fire = useCallback(() => {
    const { onPress: press, haptic: h } = latest.current;
    if (h) haptics[h]();
    press?.();
  }, []);
  const fireLong = useCallback(() => {
    haptics.tap();
    latest.current.onLongPress?.();
  }, []);
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
    hitSlop,
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
  const actions = [
    ...(onPress && !disabled ? [{ name: 'activate' as const }] : []),
    // Named, so VoiceOver lists it in the actions rotor (iOS has no long-press action of its own).
    ...(onLongPress && !disabled ? [{ name: 'longpress', label: t('shell.action.more') }] : []),
  ];
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'activate') fire();
    if (e.nativeEvent.actionName === 'longpress') fireLong();
  };
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        {...a11y}
        {...(actions.length > 0
          ? { accessibilityActions: actions, onAccessibilityAction: onAction }
          : {})}
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
                backgroundColor: palette.pressShade,
              },
              shade,
            ]}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
