import type { Weight } from './type';

/**
 * The hand face (eyebrows, day dividers, critter bubbles), in both languages: Kithfield Hand,
 * Gaegu Bold as the design draws it, extended with Vietnamese by the designer. It has every
 * Vietnamese letter and combining mark, and its metrics are Gaegu's, so the design's sizes and
 * line heights stand.
 *
 * A new version of Kithfield Hand drops in through `tools/fonts` (its entry in `src/sources.ts`,
 * subset as `fonts/KithfieldHand-subset.txt` says); a new hand family replaces this constant too.
 */
export const hand = {
  name: 'KithfieldHand-Bold',
  family: 'Kithfield Hand',
  weight: 700,
} as const satisfies { name: string; family: string; weight: Weight };
