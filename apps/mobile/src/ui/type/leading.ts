import { naturalLineHeight } from '@kithfield/theme';
import { PixelRatio, Platform, type TextStyle } from 'react-native';

type Edge = 'Top' | 'Bottom';

/**
 * A margin or padding edge the style sets in points, from the most specific property that sets
 * it (`marginTop`, then `marginVertical`, then `margin`); 0 when none does, null when it is not
 * in points (a percentage or `auto`), which cannot be added to.
 */
function edge(style: TextStyle, kind: 'margin' | 'padding', side: Edge): number | null {
  const value = style[`${kind}${side}`] ?? style[`${kind}Vertical`] ?? style[kind];
  if (value === undefined) return 0;
  return typeof value === 'number' ? value : null;
}

/**
 * `style` (flattened, with its final font size and line height) drawn where the browser draws it.
 * Below the face's own line height iOS sits each line at the bottom of its line box and cuts off
 * what rises above the text's box, where the browser centres the line and lets it overflow. The
 * text gets that room back, and margins hold its box where it was (adding to any it sets).
 * Wrapping text takes the room as top padding, so its lines stay `lineHeight` apart; `oneLine`
 * text is set at the face's own line height instead, so a row aligned on baselines still finds
 * its baseline (iOS leaves padding out of it). `scale` is what Dynamic Type enlarges the size and
 * line height by; margins and padding are in points, which it leaves alone. Other platforms, and
 * text with no line height or room enough, are left as they are.
 */
export function leading(style: TextStyle, oneLine = false, scale = 1): TextStyle {
  const { fontSize = 14, lineHeight } = style;
  if (Platform.OS !== 'ios' || lineHeight === undefined) return style;
  const natural = fontSize * naturalLineHeight(style.fontFamily);
  if ((natural - lineHeight) * scale <= 0) return style;
  // The room, in points as drawn, rounded up to whole pairs of device pixels: iOS measures text on
  // the pixel grid, and half of it on each side then keeps the box (and all after it) on the grid.
  const pair = 2 / PixelRatio.get();
  const lost = Math.ceil(((natural - lineHeight) * scale) / pair - 1e-6) * pair;
  const top = edge(style, 'margin', 'Top');
  const bottom = edge(style, 'margin', 'Bottom');
  const box =
    top === null || bottom === null
      ? {}
      : { marginTop: top - lost / 2, marginBottom: bottom - lost / 2 };
  if (oneLine) return { ...style, ...box, lineHeight: lineHeight + lost / scale };
  const padding = edge(style, 'padding', 'Top');
  // A top padding that is not in points cannot take the room; leave the text as it was.
  if (padding === null) return style;
  return { ...style, ...box, paddingTop: padding + lost };
}
