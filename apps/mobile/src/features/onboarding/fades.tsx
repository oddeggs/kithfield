import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useEffect, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withDelay } from 'react-native-reanimated';

import { fadeTo } from '../../ui/motion/motion';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import type { ViewStyleProp } from '../../ui/style';
import { useTheme } from '../../ui/theme/theme-provider';

/**
 * Fades up into place after `delay` ms (`motion.fade`), as the sign-in buttons arrive one after
 * another. Under Reduce Motion it only fades.
 */
export function FadeUp({
  delay = 0,
  style,
  children,
}: {
  readonly delay?: number;
  readonly style?: ViewStyleProp;
  readonly children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withDelay(delay, fadeTo(1)));
  }, [delay, shown]);
  const animated = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: reduce ? 0 : (1 - shown.get()) * 8 }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const RINGS = {
  day: { on: '0 0 0 2.5px #F5EEE2, 0 0 0 4.5px #2a221d', off: '0 0 0 1px rgba(42,34,29,.12)' },
  night: { on: '0 0 0 2.5px #1B1F3D, 0 0 0 4.5px #F4ECDA', off: '0 0 0 1px rgba(255,255,255,.14)' },
} as const;

/** The selection ring of the critter picker: a paper gap, then ink. It snaps; it never tweens. */
export function useRing(): (on: boolean, off?: string) => string {
  const { appearance } = useTheme();
  const rings = RINGS[appearance];
  return (on, off) => (on ? rings.on : (off ?? rings.off));
}

/**
 * The art fading into the screen behind the text: paper by day. The way-in scenes are drawn in
 * daylight, so at night this fades them into the night sky instead of the paper they end on.
 */
export function PaperFade({
  width,
  top,
  height,
}: {
  readonly width: number;
  readonly top: number;
  readonly height: number;
}) {
  const { palette } = useTheme();
  const colour = palette.background;
  return (
    <Canvas style={{ position: 'absolute', left: 0, top, width, height }} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height * 0.7)}
          colors={[`${colour}00`, colour]}
        />
      </Rect>
    </Canvas>
  );
}
