import type { TypeStyleKey } from '@kithfield/theme';
import type { TextStyle } from 'react-native';

/**
 * A step of the type ramp at the size the farm's art calls for (a hand-lettered bubble, an island
 * label), for the `Txt` of step `_base`. Sizes stay in the design's units: `Txt` sets them in the
 * app's faces, and gives Vietnamese the taller line its stacked marks need.
 */
export function typeAt(
  _base: TypeStyleKey,
  size: number,
  lineHeight: number,
  _fontLocale?: string,
): TextStyle {
  return { fontSize: size, lineHeight };
}
