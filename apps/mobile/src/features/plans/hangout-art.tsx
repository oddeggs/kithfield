import { fireLoop, type FrameLoop } from '@kithfield/art';
import { motion } from '@kithfield/theme';
import { Canvas, Image } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useArt, useArtStill } from '../../ui/art/art-provider';
import { Avatar } from '../../ui/art/avatar';
import { fadeTo } from '../../ui/motion/motion';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useArtVisible } from '../../ui/motion/visibility';
import type { PlanPerson } from './people';

/** Where the campfire scene sets its fire, as fractions of the scene (`kithfield-art.js`). */
const FIRE_X = 0.5;
const FIRE_Y = 0.62;
/** The campfire's flame size, as a fraction of the scene's width. */
const FLAME = 0.17;
/** `fireLoop` draws a flame 0.6 of its square, with its base 0.9 of the way down. */
const LOOP_FLAME = 0.6;
const LOOP_BASE = 0.9;
/** Runs `fn` once the JS thread is idle; answers how to cancel it. */
const whenIdle = (fn: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn);
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

/** The scene time the still is drawn at, as `ArtLoop` holds still art. */
const STILL_T = 1.2;

/**
 * The hangout's night campfire: the scene drawn once as a still, with the fire on its own
 * loop over it, flickering on twos on the UI thread. Under Reduce Motion and off screen the fire
 * holds still.
 */
export function Campfire({
  width,
  height,
  season,
}: {
  readonly width: number;
  readonly height: number;
  readonly season: string;
}) {
  const store = useArt();
  const scene = useArtStill({ scene: 'campfire', width, height, attrs: { season } }, STILL_T);
  const reduce = useReduceMotion();
  const visible = useArtVisible();
  const size = Math.round((width * FLAME) / LOOP_FLAME);
  // Drawn when the JS thread is idle, so the fire never holds up the screen's first frame.
  const [loop, setLoop] = useState<FrameLoop | null>(null);
  useEffect(() => {
    if (reduce) {
      setLoop(null);
      return;
    }
    return whenIdle(() => setLoop(fireLoop(store.art, size, PixelRatio.get())));
  }, [store, size, reduce]);
  const frames = loop?.frames ?? [];
  const fps = loop?.fps ?? motion.twos.fps;
  const elapsed = useSharedValue(0);
  const clock = useFrameCallback((info) => elapsed.set(info.timeSinceFirstFrame), false);
  const running = visible && frames.length > 1;
  useEffect(() => {
    clock.setActive(running);
  }, [clock, running]);
  const image = useDerivedValue(() => {
    const n = frames.length;
    if (n === 0) return null;
    return frames[Math.floor((elapsed.get() / 1000) * fps) % n] ?? null;
  });
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, width, height }}
    >
      <Canvas style={{ width, height }}>
        <Image image={scene} x={0} y={0} width={width} height={height} />
        {loop ? (
          <Image
            image={image}
            x={width * FIRE_X - size / 2}
            y={height * FIRE_Y - size * LOOP_BASE}
            width={size}
            height={size}
          />
        ) : null}
      </Canvas>
    </View>
  );
}

/** How far a critter walks in from, and how high it hops, in points. */
const WALK_FROM = 36;
const HOP = 6;
const STEPS = 4;

/**
 * A friend's critter arriving at the fire: it walks in from the path on the right, hopping on
 * twos (each step a held drawing), then settles into the circle. Under Reduce Motion it fades in.
 */
export function Arriving({
  who,
  size,
  ring,
  first,
  arriving,
}: {
  readonly who: PlanPerson;
  readonly size: number;
  readonly ring: string;
  readonly first: boolean;
  /** Only someone who came while the screen was open walks in. */
  readonly arriving: boolean;
}) {
  const reduce = useReduceMotion();
  const x = useSharedValue(arriving && !reduce ? WALK_FROM : 0);
  const y = useSharedValue(0);
  const shown = useSharedValue(arriving ? 0 : 1);
  const started = useRef(false);
  useEffect(() => {
    if (!arriving || started.current) return;
    started.current = true;
    if (reduce) {
      shown.set(fadeTo(1));
      return;
    }
    const hold = motion.twos.frameMs;
    shown.set(withTiming(1, { duration: 0 }));
    const steps = Array.from({ length: STEPS }, (_, i) =>
      withDelay(hold, withTiming(WALK_FROM * (1 - (i + 1) / STEPS), { duration: 0 })),
    );
    const hops = Array.from({ length: STEPS }, (_, i) =>
      withDelay(hold, withTiming(i % 2 === 0 ? -HOP : 0, { duration: 0 })),
    );
    x.set(withSequence(...steps));
    y.set(withSequence(...hops, withDelay(hold, withTiming(0, { duration: 0 }))));
  }, [arriving, reduce, x, y, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));
  return (
    <Animated.View style={[first ? null : { marginLeft: -8 }, style]}>
      <Avatar kind={who.kind} look={who.look} size={size} ring={ring} label={who.name} />
    </Animated.View>
  );
}
