import { StyleSheet, type TextStyle } from 'react-native';

import { useLocale } from '../../ui/locale/locale-provider';
import { Txt, type TxtProps } from '../../ui/type/text';
import { lines } from './look';

/**
 * `Txt` for the fire room, whose labels are set tight in English (a chip, a badge, a hand line): in
 * Vietnamese each line gets room for the marks stacked above its letters.
 */
export function FireTxt({ style, ...props }: TxtProps) {
  const { fontLocale } = useLocale();
  // The same cast `Txt` makes: Expo's web typings widen text styles past what `flatten` takes.
  const flat = (StyleSheet.flatten(style as never) ?? {}) as TextStyle;
  const roomy =
    flat.fontSize !== undefined && flat.lineHeight !== undefined
      ? { lineHeight: lines(fontLocale, flat.fontSize, flat.lineHeight).lineHeight }
      : null;
  return <Txt {...props} style={[style, roomy]} />;
}
