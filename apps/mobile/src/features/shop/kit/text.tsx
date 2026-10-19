import { Children, type ReactNode } from 'react';
import type { TextStyle } from 'react-native';

import { useLocale } from '../../../ui/locale/locale-provider';
import { Txt, type TxtProps } from '../../../ui/type/text';
import { lineHeightOf, type Face } from './line-height';
import type { TypeVariant } from '../../../ui/type/styles';

export type { Face } from './line-height';

export interface STextProps extends Omit<TxtProps, 'variant'> {
  /** Defaults to the system face. */
  readonly f?: Face;
  /** Size in points, as the design writes it. */
  readonly s: number;
  /** Line height as a ratio of the size (`/1.45`); 1 when the design writes `/1`. */
  readonly lh?: number;
  /** 400, 500, 600 or 700 (the hand face is always 700). */
  readonly w?: 400 | 500 | 600 | 700;
  /** Upper case with the design's tracking (`letter-spacing:.06em`). */
  readonly caps?: boolean;
}

/** The design sets its hand lettering with the straight apostrophe, never the curly one. */
const straightQuotes = (children: ReactNode): ReactNode =>
  Children.map(children, (c) => (typeof c === 'string' ? c.replace(/\u2019/g, "'") : c));

/** The library step each face and weight scales with under Dynamic Type. */
function variantOf(f: Face, w: number): TypeVariant {
  if (f === 'serif') return 'displayM';
  if (f === 'hand') return 'handL';
  return w >= 600 ? 'button' : 'body';
}

/**
 * Text as the shop's designs set it: a face, a size and a line height, on the library's type
 * ramp for the face (set in the app's faces, as `Txt` sets them) and its Dynamic Type style. A line
 * height never falls below what Vietnamese's stacked marks need.
 */
export function SText({
  f = 'sys',
  s,
  lh = 1,
  w = 400,
  caps = false,
  style,
  children,
  ...rest
}: STextProps) {
  const { fontLocale } = useLocale();
  const lineHeight = lineHeightOf(f, s, lh, fontLocale);
  const own: TextStyle = {
    fontSize: s,
    lineHeight,
    ...(f === 'sys' ? { fontWeight: String(w) as TextStyle['fontWeight'] } : {}),
    ...(caps ? { textTransform: 'uppercase', letterSpacing: s * 0.06 } : {}),
  };
  return (
    <Txt
      variant={variantOf(f, w)}
      {...(f === 'sys' && w === 500 ? { medium: true } : {})}
      {...rest}
      style={[own, style]}
    >
      {f === 'hand' ? straightQuotes(children) : children}
    </Txt>
  );
}
