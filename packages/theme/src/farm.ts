import { night } from './colour';
import type { Bezier } from './motion';

/**
 * The farm screens' own tokens, from `design/04 Farm and Chat.dc.html` and the art's night pass
 * (`night()` in `design/kithfield-art.js`).
 */
export const farm = {
  /** Season changes cross-fade the whole scene over 1.2 s (developer notes). */
  seasonFade: { durationMs: 1200, bezier: [0.45, 0, 0.55, 1] as Bezier },
  /** Bubbles bob 2 points on a 3-second loop (developer notes). */
  bob: { distance: 2, periodMs: 3000 },
  /** The art's night pass: a multiply of the night sky at this strength over the farm. */
  night: { color: night.sky, strength: 0.82 },
  shadows: {
    /** The glass pills over the farm. */
    glassPill: '0 8px 24px -12px rgba(60,40,20,.3)',
    /** Hand-lettered bubbles over the farm. */
    bubble: '0 4px 12px -6px rgba(60,40,20,.45)',
    /** The labels on the valley's islands. */
    islandLabel: '0 4px 14px -6px rgba(60,40,20,.45)',
  },
} as const;

/**
 * The art's night pass as a colour matrix for drawings laid over the night scene: multiplying by
 * the night sky at `strength` scales each channel by `1 - strength * (1 - sky)`. `amount` runs
 * from 0 (day) to 1 (night).
 */
export function nightMatrix(amount: number): number[] {
  'worklet';
  const hex = farm.night.color;
  const n = parseInt(hex.slice(1), 16);
  const k = farm.night.strength * amount;
  const scale = (c: number) => 1 - k * (1 - c / 255);
  const r = scale((n >> 16) & 255);
  const g = scale((n >> 8) & 255);
  const b = scale(n & 255);
  return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
}
