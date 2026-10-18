import { fontFor, type, type TypeStyleKey } from '@kithfield/theme';

/**
 * A step of the type ramp at the size the farm's art calls for (a hand-lettered bubble, an island
 * label), in the reader's language: Vietnamese swaps the face and takes the taller line its
 * stacked marks need, so no mark is clipped.
 */
export function typeAt(base: TypeStyleKey, size: number, lineHeight: number, fontLocale: string) {
  return fontFor({ ...type[base], size, lineHeight }, fontLocale, { multiline: true });
}
