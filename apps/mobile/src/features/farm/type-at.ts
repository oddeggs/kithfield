import { type, type TypeStyleKey } from '@kithfield/theme';
import type { TextStyle } from 'react-native';

/**
 * A step of the type ramp at the size the farm's art calls for (a hand-lettered bubble, an island
 * label), for a `Txt`. Sizes stay in the design's units: `Txt` sets them in the app's faces, and
 * gives Vietnamese the taller line its stacked marks need. A system step keeps its own weight, so
 * a `Txt` that scales with a lighter step (a caption set as a row title, a bold phrase in a line)
 * is still drawn at the weight the design gives it.
 */
export function typeAt(
  base: TypeStyleKey,
  size: number,
  lineHeight: number,
  _fontLocale?: string,
): TextStyle {
  const s = type[base];
  return {
    fontSize: size,
    lineHeight,
    ...(s.face === 'system' ? { fontWeight: String(s.weight) as TextStyle['fontWeight'] } : {}),
  };
}
