import { day, fieldGuideColours, motion, type FieldGuideColours } from '@kithfield/theme';

import { useTheme } from '../../ui/theme/theme-provider';

/** The field guide's colours in the current appearance, from the theme. */
export type GuideLook = FieldGuideColours;

export function useGuideLook(): GuideLook {
  return fieldGuideColours[useTheme().appearance];
}

/** The guide's motion, from the design's developer notes and the theme's breathing. */
export const guideMotion = {
  /** A season tab cross-fades the rows; the tiles hold still. */
  rowsFadeMs: 160,
  /** The hero plant sways ±2° on a 4-second loop; the porch pot ±1°. */
  sway: { degrees: 2, periodMs: 4000 },
  potSway: { degrees: 1 },
  /** A sleepy plant breathes slower, as a sleeping critter does. */
  sleepyPeriodMs: Math.round((4000 * motion.breath.asleepMs) / motion.breath.awakeMs),
  /** The basket fills one crop at a time. */
  basketStepMs: 150,
} as const;

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/** The pale wash behind a plant's hero drawing: its bloom colour, a fifth of the way from white. */
export function heroTint(bloom: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(bloom)) return day.sheet;
  const mixed = [0, 1, 2].map((i) => Math.round(255 + (channel(bloom, i) - 255) * 0.18));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
