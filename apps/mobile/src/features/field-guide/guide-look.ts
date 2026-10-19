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

/** A scrapbook card as the design lays it out, in points. */
export const scrapCard = {
  padTop: 10,
  padBottom: 12,
  padX: 10,
  gap: 6,
  art: 110,
  /** The season (hand-lettered), the note's line, the pressed date: sizes that are their lines. */
  season: 15,
  note: { size: 12, line: 16.2 },
  date: 11,
  border: 1.5,
} as const;

const c = scrapCard;
const top = c.padTop + c.art + c.gap + c.season + c.gap;

/**
 * How tall a scrapbook card stands: as the design draws it, where a pressed card's note runs to
 * three lines and a dashed one's to two. Shorter notes keep that height; longer ones grow it.
 */
export const scrapCardHeight = {
  pressed: top + 3 * c.note.line + c.gap + c.date + c.padBottom,
  waiting: top + 2 * c.note.line + c.padBottom + 2 * c.border,
} as const;
