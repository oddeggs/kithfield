import { motion, press, springs } from '@kithfield/theme';
import {
  Easing,
  ReduceMotion,
  withSpring,
  withTiming,
  type AnimationCallback,
} from 'react-native-reanimated';

/**
 * The shared motion of `01 Foundations` on Reanimated, all on the UI thread. Each helper takes
 * the Reduce Motion flag from `useReduceMotion`: under it a move becomes `motion.fade`, and the
 * caller swaps what moves for what fades (`12 States`, Reduce Motion). Reanimated's own Reduce Motion
 * handling is turned off here, since it would skip the fade too.
 */
export const easings = {
  fade: Easing.bezier(...motion.fade.bezier),
  cross: Easing.linear,
  reveal: Easing.bezier(...motion.reveal.bezier),
} as const;

const never = ReduceMotion.Never;

/** `motion.fade`: 200 ms ease-out. Fades and every Reduce Motion swap. */
export function fadeTo(to: number, done?: AnimationCallback): number {
  'worklet';
  return withTiming(
    to,
    { duration: motion.fade.durationMs, easing: easings.fade, reduceMotion: never },
    done,
  );
}

/** `motion.cross`: a 120 ms linear cross-fade (search results, swaps). */
export function crossTo(to: number, done?: AnimationCallback): number {
  'worklet';
  return withTiming(
    to,
    { duration: motion.cross.durationMs, easing: easings.cross, reduceMotion: never },
    done,
  );
}

/**
 * `motion.sheet`: the spring of sheets, cards, menus and travelling elements, carrying the
 * finger's velocity. With Reduce Motion it lands without moving; fade what it reveals instead.
 */
export function sheetTo(
  to: number,
  reduce: boolean,
  velocity = 0,
  done?: AnimationCallback,
): number {
  'worklet';
  if (reduce) return withTiming(to, { duration: 0, reduceMotion: never }, done);
  return withSpring(to, { ...springs.sheet, velocity, reduceMotion: never }, done);
}

/** The press state: toward 1 over `press.durationMs` on the way in and back out. */
export function pressTo(to: number): number {
  'worklet';
  return withTiming(to, { duration: press.durationMs, easing: easings.fade, reduceMotion: never });
}
