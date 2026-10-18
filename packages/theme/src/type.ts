/**
 * The type scale from `design/01 Foundations.dc.html` (Type). Sizes, line heights and letter
 * spacing are in points; `letterSpacing` is absolute (the design's +6% tracking at 12 is 0.72).
 */

/** The faces the scale is set in. `system` is SF Pro on iOS (the platform face elsewhere). */
export type Face = 'youngSerif' | 'gaegu' | 'system';

/** Font weights the scale uses. */
export type Weight = 400 | 600 | 700;

/** iOS text styles the scale follows for Dynamic Type (UIFont.TextStyle). */
export type TextStyleName =
  'largeTitle' | 'title1' | 'headline' | 'body' | 'callout' | 'footnote' | 'caption1';

export interface TypeStyle {
  face: Face;
  weight: Weight;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  /** The text style it scales with, or null where the design names none. */
  textStyle: TextStyleName | null;
  /** Points off the text style's default size at the default content size (body is −2). */
  textStyleOffset: number;
}

const style = (
  face: Face,
  weight: Weight,
  size: number,
  lineHeight: number,
  textStyle: TextStyleName | null,
  extra: Partial<Pick<TypeStyle, 'letterSpacing' | 'uppercase' | 'textStyleOffset'>> = {},
): TypeStyle => ({
  face,
  weight,
  size,
  lineHeight,
  letterSpacing: extra.letterSpacing ?? 0,
  uppercase: extra.uppercase ?? false,
  textStyle,
  textStyleOffset: extra.textStyleOffset ?? 0,
});

export const type = {
  /** File and hero titles. */
  displayXL: style('youngSerif', 400, 60, 60, null),
  /** Screen titles. */
  displayL: style('youngSerif', 400, 34, 37, 'largeTitle'),
  /** Sheet titles. */
  displayM: style('youngSerif', 400, 26, 29, 'title1'),
  /** Farm name pill. */
  displayS: style('youngSerif', 400, 17, 20, 'headline'),
  /** Eyebrows, celebrations. */
  handL: style('gaegu', 700, 20, 22, null),
  /** Day dividers, critter bubbles. */
  handS: style('gaegu', 700, 15, 15, null),
  /** Buttons. */
  button: style('system', 600, 17, 17, 'headline'),
  /** Bubbles, paragraphs. */
  body: style('system', 400, 15, 22, 'body', { textStyleOffset: -2 }),
  /** List rows, cards. */
  rowTitle: style('system', 600, 16, 20, 'callout'),
  /** Row subtitles, notes. */
  caption: style('system', 400, 13.5, 18, 'footnote'),
  /** Section labels. */
  label: style('system', 700, 12, 12, 'caption1', { letterSpacing: 0.72, uppercase: true }),
} as const satisfies Record<string, TypeStyle>;

export type TypeStyleKey = keyof typeof type;

/** The design's ramp name (`Display XL`, `Row title`) as its token key (`displayXL`, `rowTitle`). */
export function typeKey(designName: string): string {
  const [first = '', ...rest] = designName.split(' ');
  const tail = rest.map((w) =>
    w.length <= 2 ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1),
  );
  return first.toLowerCase() + tail.join('');
}
