import { vietnamese } from '@kithfield/theme';

/** The three faces `09 Shop and Plus` sets: Young Serif, Gaegu and the system face. */
export type Face = 'serif' | 'hand' | 'sys';

/** Gaegu's own leading where the design sets it solid (`/1`): its lines are drawn at 1.1. */
const HAND_SOLID = 1.1;

/**
 * The line height a shop text ends with: the design's, the hand face never set solid, and never
 * below what Vietnamese's stacked marks need.
 */
export function lineHeightOf(f: Face, size: number, lh: number, fontLocale: string): number {
  const ratio = f === 'hand' && lh < HAND_SOLID ? HAND_SOLID : lh;
  const designed = Math.round(size * ratio * 10) / 10;
  return fontLocale === 'vi'
    ? Math.max(designed, Math.round(size * vietnamese.minLineHeightRatio))
    : designed;
}
