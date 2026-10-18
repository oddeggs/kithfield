import { fontFor } from '@kithfield/theme';
import { Children, useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { glyphShift, typeStyleOf, type TypeVariant } from './styles';

export interface TxtProps extends TextProps {
  /** A step of the type ramp, or a component's own text style. Defaults to body. */
  readonly variant?: TypeVariant;
  /** Defaults to the theme's text colour. */
  readonly color?: string;
  /** Text that may wrap: Vietnamese then gets the taller line height its stacked marks need. */
  readonly multiline?: boolean;
  /** Weight 500, which chips and their controls use. */
  readonly medium?: boolean;
  /** The design's monospace (support codes, identifiers). */
  readonly mono?: boolean;
  readonly align?: TextStyle['textAlign'];
  readonly children?: ReactNode;
}

/** Hand-face text must be precomposed: Patrick Hand has no combining marks (see `fontFor`). */
const nfc = (children: ReactNode): ReactNode =>
  Children.map(children, (c) => (typeof c === 'string' ? c.normalize('NFC') : c));

/**
 * Text in the type ramp, in the reader's language (Vietnamese swaps Young Serif for Lora and Gaegu
 * for Patrick Hand), scaled with the iOS text style it follows for Dynamic Type.
 */
export function Txt({
  variant = 'body',
  color,
  multiline = false,
  medium = false,
  mono = false,
  align,
  style,
  children,
  ...rest
}: TxtProps) {
  const { fontLocale } = useLocale();
  const { palette } = useTheme();
  const s = typeStyleOf(variant);
  const { fontScale } = useWindowDimensions();
  const font = useMemo<TextStyle>(
    () => ({
      // Vietnamese stacks marks above capitals and tall letters: even one line needs the taller
      // line height, or the marks are clipped at the top of the line.
      ...fontFor(s, fontLocale, { multiline: multiline || fontLocale === 'vi' }),
      ...(medium && s.face === 'system' ? { fontWeight: '500' as const } : {}),
      ...(mono ? { fontFamily: 'Menlo' } : {}),
    }),
    [s, fontLocale, multiline, medium, mono],
  );
  // The shift follows whatever size and line height the caller's style ends with, and grows
  // with the text when Dynamic Type scales it; any transform of the caller's is kept.
  // Expo's web typings widen text styles past what `flatten` takes; the native shape is the same.
  const own = (StyleSheet.flatten(style as never) ?? {}) as TextStyle;
  const size = own.fontSize ?? font.fontSize ?? 0;
  const line = own.lineHeight ?? font.lineHeight ?? size;
  const family = own.fontFamily ?? font.fontFamily ?? 'system';
  const scale =
    rest.allowFontScaling === false
      ? 1
      : Math.min(fontScale, rest.maxFontSizeMultiplier ?? Infinity);
  const shift = glyphShift(family, size, line, scale);
  const kept: readonly object[] = Array.isArray(own.transform) ? (own.transform as object[]) : [];
  const transform = shift > 0 ? ([...kept, { translateY: shift }] as TextStyle['transform']) : null;
  return (
    <Text
      {...(s.ramp === null ? {} : { dynamicTypeRamp: s.ramp })}
      {...rest}
      style={[
        font,
        { color: color ?? palette.text },
        align ? { textAlign: align } : null,
        style,
        transform ? { transform } : null,
      ]}
    >
      {s.face === 'system' ? children : nfc(children)}
    </Text>
  );
}
