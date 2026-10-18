import { springs } from '@kithfield/theme';
import type { ReactNode } from 'react';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
  useExclusiveGestures,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** How far down a swipe closes the viewer, or how fast. */
const CLOSE_AT = 120;
const CLOSE_SPEED = 900;
const MAX_ZOOM = 4;

/**
 * One photo or video in the viewer: pinch to zoom (and pan while zoomed), double-tap to zoom in
 * or out, and swipe down to close, the screen fading as it goes. `drag` is shared with the
 * viewer so its chrome and backdrop fade with the swipe.
 */
export function Zoomable({
  width,
  height,
  drag,
  zoomed,
  onClose,
  onTap,
  children,
}: {
  readonly width: number;
  readonly height: number;
  readonly drag: SharedValue<number>;
  /** Set while zoomed in, so the pager doesn't page. */
  readonly zoomed: SharedValue<boolean>;
  readonly onClose: () => void;
  readonly onTap?: () => void;
  readonly children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const start = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const panStart = useSharedValue({ x: 0, y: 0 });
  const spring = { ...springs.sheet };

  const settle = () => {
    'worklet';
    if (scale.get() <= 1.01) {
      scale.set(withSpring(1, spring));
      x.set(withSpring(0, spring));
      y.set(withSpring(0, spring));
      zoomed.set(false);
    } else {
      const maxX = ((scale.get() - 1) * width) / 2;
      const maxY = ((scale.get() - 1) * height) / 2;
      x.set(withSpring(Math.max(-maxX, Math.min(maxX, x.get())), spring));
      y.set(withSpring(Math.max(-maxY, Math.min(maxY, y.get())), spring));
    }
  };

  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      start.set(scale.get());
    },
    onUpdate: (e) => {
      'worklet';
      scale.set(Math.max(0.8, Math.min(MAX_ZOOM, start.get() * e.scale)));
      zoomed.set(scale.get() > 1.01);
    },
    onDeactivate: () => {
      'worklet';
      settle();
    },
  });
  const pan = usePanGesture({
    // Zoomed in, a drag moves the photo; at rest, a downward drag closes the viewer.
    activeOffsetY: [-10, 10],
    failOffsetX: [-18, 18],
    onBegin: () => {
      'worklet';
      panStart.set({ x: x.get(), y: y.get() });
    },
    onUpdate: (e) => {
      'worklet';
      if (scale.get() > 1.01) {
        x.set(panStart.get().x + e.translationX);
        y.set(panStart.get().y + e.translationY);
      } else {
        drag.set(Math.max(0, e.translationY));
      }
    },
    onDeactivate: (e) => {
      'worklet';
      if (scale.get() > 1.01) {
        settle();
        return;
      }
      if (drag.get() > CLOSE_AT || e.velocityY > CLOSE_SPEED) {
        scheduleOnRN(onClose);
      } else {
        drag.set(withSpring(0, spring));
      }
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      const next = scale.get() > 1.01 ? 1 : 2.5;
      scale.set(withSpring(next, spring));
      zoomed.set(next > 1);
      if (next === 1) {
        x.set(withSpring(0, spring));
        y.set(withSpring(0, spring));
      }
    },
  });
  const tap = useTapGesture({
    onActivate: () => {
      'worklet';
      if (onTap) scheduleOnRN(onTap);
    },
  });
  const taps = useExclusiveGestures(doubleTap, tap);
  const gesture = useSimultaneousGestures(pinch, pan, taps);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() + drag.get() },
      { scale: scale.get() * (1 - Math.min(0.2, drag.get() / 1500)) },
    ],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, style]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
