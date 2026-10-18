import { fontFor } from '@kithfield/theme';
import { Children, useMemo, type ReactNode } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { glyphHeight, typeStyleOf, type TypeVariant } from './styles';

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
  const font = useMemo<TextStyle>(() => {
    // Vietnamese stacks marks above capitals and tall letters: even one line needs the taller
    // line height, or the marks are clipped at the top of the line.
    const f = fontFor(s, fontLocale, { multiline: multiline || fontLocale === 'vi' });
    const family = mono ? 'Menlo' : (f.fontFamily ?? 'system');
    const shift = Math.max(0, ((glyphHeight[family] ?? 1.2) * f.fontSize - f.lineHeight) / 2);
    return {
      ...f,
      ...(medium && s.face === 'system' ? { fontWeight: '500' as const } : {}),
      ...(mono ? { fontFamily: 'Menlo' } : {}),
      ...(shift > 0 ? { transform: [{ translateY: shift }] } : {}),
    };
  }, [s, fontLocale, multiline, medium, mono]);
  return (
    <Text
      {...(s.ramp === null ? {} : { dynamicTypeRamp: s.ramp })}
      {...rest}
      style={[font, { color: color ?? palette.text }, align ? { textAlign: align } : null, style]}
    >
      {s.face === 'system' ? children : nfc(children)}
    </Text>
  );
}
