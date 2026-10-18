import {
  fieldGuideColours,
  fieldGuideMotion,
  motion,
  type FieldGuideColours,
} from '@kithfield/theme';

import { useTheme } from '../../ui/theme/theme-provider';

/** The field guide's colours in the current appearance, from the theme. */
export type GuideLook = FieldGuideColours;

export function useGuideLook(): GuideLook {
  return fieldGuideColours[useTheme().appearance];
}

/** The guide's motion, from the theme: the design's notes, the cross-fade and the twos. */
export const guideMotion = {
  ...fieldGuideMotion,
  /** A season tab cross-fades the rows (the design asks 160 ms; the theme's swap cross-fade). */
  rowsFade: motion.cross,
  /** A sleepy plant breathes slower, as a sleeping critter does. */
  sleepyPeriodMs: Math.round(
    (fieldGuideMotion.sway.periodMs * motion.breath.asleepMs) / motion.breath.awakeMs,
  ),
  /** Each of a rare bloom's three drawings is held three frames on twos. */
  bloomHoldMs: 3 * motion.twos.frameMs,
} as const;
