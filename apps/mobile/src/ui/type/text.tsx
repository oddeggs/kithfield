import { fontFor } from '@kithfield/theme';
import { Children, createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { fontSizeMultiplier } from './dynamic-type';
import { leading } from './leading';
import { typeStyleOf, type TypeVariant } from './styles';

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

/** True inside a Txt: nested text is drawn on its parent's lines. */
const InsideTxt = createContext(false);

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
  const nested = useContext(InsideTxt);
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
  // The room iOS needs follows whatever size and line height the caller's style ends with, and
  // grows with the text when Dynamic Type scales it. Text nested in a Txt is laid out by its
  // parent's lines, so only the outermost one takes it.
  // Expo's web typings widen text styles past what `flatten` takes; the native shape is the same.
  const own = StyleSheet.flatten([
    font,
    { color: color ?? palette.text },
    align ? { textAlign: align } : null,
    style,
  ] as never) as TextStyle;
  const scale = fontSizeMultiplier({
    fontScale,
    ramp: rest.dynamicTypeRamp ?? s.ramp,
    allowFontScaling: rest.allowFontScaling,
    maxFontSizeMultiplier: rest.maxFontSizeMultiplier,
  });
  // Only text held to one line takes the taller line (for baseline rows); text that may wrap,
  // even when not marked multiline (Dynamic Type wraps labels too), keeps its lines apart.
  const oneLine = rest.numberOfLines === 1;
  const final = nested ? own : leading(own, oneLine, scale);
  return (
    <Text {...(s.ramp === null ? {} : { dynamicTypeRamp: s.ramp })} {...rest} style={final}>
      <InsideTxt.Provider value>
        {s.face === 'system' ? children : nfc(children)}
      </InsideTxt.Provider>
    </Text>
  );
}
