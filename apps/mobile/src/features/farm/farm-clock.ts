import { motion } from '@kithfield/theme';

/*
 * The farm's one clock, as the UI thread runs it: on twos (twelve drawings a second, as the art
 * moves), carrying on from where it stopped. Breathing and blinking are the renderer's own
 * (`critter()` and `blinkAt()` in the art), on the theme's breathing periods.
 */

const FRAME_S = motion.twos.frameMs / 1000;
const AWAKE_S = motion.breath.awakeMs / 1000;
const ASLEEP_S = motion.breath.asleepMs / 1000;
const TAU = Math.PI * 2;

/**
 * The clock `sinceS` seconds after it (re)started from `base`, stepped to the last drawing due,
 * and whether that differs from `current`, so the clock is only set when a new drawing is due.
 */
export function tick(base: number, sinceS: number, current: number) {
  'worklet';
  const t = Math.floor((base + sinceS) / FRAME_S) * FRAME_S;
  return { t, changed: t !== current };
}

/** How far a critter's breath stretches it at `t`: a sine, deeper and slower asleep. */
export function breathOf(t: number, ph: number, asleep: boolean): number {
  'worklet';
  return asleep
    ? Math.sin((t / ASLEEP_S) * TAU + ph * 6) * 0.028
    : Math.sin((t / AWAKE_S) * TAU + ph * 6) * 0.015;
}

/** Whether a critter's eyes are shut in a blink at `t`. */
export function isBlinking(t: number, ph: number): boolean {
  'worklet';
  return (t + ph * 7) % (3.4 + ph * 2.1) < 0.13;
}
