import { FONT_LINE_HEIGHT } from './font-metrics.generated';
import { type Face, type TypeStyle, type TypeStyleKey, type Weight, type } from './type';

/**
 * The embedded fonts, by the name each registers under: the PostScript name, which is also the
 * file name in `@kithfield/theme/fonts/` (iOS finds a font by PostScript name, Android and web by
 * the file or the name it is loaded as).
 */
export const fonts = {
  youngSerif: 'YoungSerif-Regular',
  gaeguBold: 'Gaegu-Bold',
  patrickHand: 'PatrickHand-Regular',
  lora: 'Lora-Regular',
  loraSemiBold: 'Lora-SemiBold',
} as const;

export type FontName = (typeof fonts)[keyof typeof fonts];

export interface FontFace {
  name: FontName;
  /** The family as the design's CSS names it. */
  family: string;
  weight: Weight;
  /** File name in `@kithfield/theme/fonts/`. */
  file: `${FontName}.ttf`;
  /** The design's CSS stack for this family. */
  css: string;
}

const face = (name: FontName, family: string, weight: Weight, css: string): FontFace => ({
  name,
  family,
  weight,
  file: `${name}.ttf`,
  css,
});

/** Every embedded font. Young Serif and Gaegu have no Vietnamese; Patrick Hand and Lora do. */
export const fontFaces: readonly FontFace[] = [
  face(fonts.youngSerif, 'Young Serif', 400, "'Young Serif',Georgia,serif"),
  face(fonts.gaeguBold, 'Gaegu', 700, 'Gaegu,cursive'),
  face(fonts.patrickHand, 'Patrick Hand', 400, "'Patrick Hand',cursive"),
  face(fonts.lora, 'Lora', 400, "'Lora',Georgia,serif"),
  face(fonts.loraSemiBold, 'Lora', 600, "'Lora',Georgia,serif"),
];

/** The system face (SF Pro) as the design's CSS names it. */
export const systemCss = '-apple-system,system-ui';

/**
 * Vietnamese swaps the whole stack, never glyph by glyph: display becomes Lora 600 and hand
 * becomes Patrick Hand, set 2 points larger. SF Pro covers Vietnamese and stays.
 *
 * Text set in the hand face must be precomposed (NFC): Patrick Hand has every precomposed
 * Vietnamese letter but no combining circumflex (U+0302) or breve (U+0306), so decomposed text
 * would fall back to another font inside a word. Catalogue copy is NFC-checked; normalise
 * user-typed text with `text.normalize('NFC')` before rendering it.
 */
export const vietnamese = {
  youngSerif: { font: fonts.loraSemiBold, sizeDelta: 0 },
  gaegu: { font: fonts.patrickHand, sizeDelta: 2 },
  /** Wrapping text rises to at least this line height so stacked marks never touch. */
  minLineHeightRatio: 1.4,
} as const;

const english: Record<Exclude<Face, 'system'>, FontName> = {
  youngSerif: fonts.youngSerif,
  gaegu: fonts.gaeguBold,
};

/** A text style resolved for one locale, shaped to spread into a React Native or web style. */
export interface TextFont {
  /** Absent for the system face, which takes `fontWeight` instead. */
  fontFamily?: FontName;
  /** Only for the system face: an embedded font carries its weight in the file. */
  fontWeight?: '400' | '600' | '700';
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: 'uppercase';
}

export interface FontOptions {
  /** Text that may wrap: in Vietnamese the line height rises to `minLineHeightRatio`. */
  multiline?: boolean;
}

/** True for `vi` and its regional tags, in any case and with either separator (`VI`, `vi_VN`). */
export function isVietnamese(locale: string): boolean {
  const l = locale.toLowerCase().replace('_', '-');
  return l === 'vi' || l.startsWith('vi-');
}

/** The type style `style` as set in `locale`, with the Vietnamese stack swapped in. */
export function fontFor(
  style: TypeStyleKey | TypeStyle,
  locale: string,
  options: FontOptions = {},
): TextFont {
  const s = typeof style === 'string' ? type[style] : style;
  const vi = isVietnamese(locale);
  const swap = vi && s.face !== 'system' ? vietnamese[s.face] : null;
  const fontSize = s.size + (swap?.sizeDelta ?? 0);
  let lineHeight = Math.round((s.lineHeight * fontSize) / s.size);
  if (vi && options.multiline) {
    lineHeight = Math.max(lineHeight, Math.round(fontSize * vietnamese.minLineHeightRatio));
  }
  return {
    ...(s.face === 'system'
      ? { fontWeight: String(s.weight) as NonNullable<TextFont['fontWeight']> }
      : { fontFamily: swap?.font ?? english[s.face] }),
    fontSize,
    lineHeight,
    letterSpacing: s.letterSpacing,
    ...(s.uppercase ? { textTransform: 'uppercase' as const } : {}),
  };
}

/**
 * SF Pro's own line height in ems on iOS, at every size: hhea (1950 + 494) / 2048, which
 * `UIFont.systemFont(ofSize:).lineHeight` gives (Core Text on the iOS 27 runtime's `SFUI.ttf`).
 */
export const SYSTEM_LINE_HEIGHT = 2444 / 2048;

/** Menlo's (the monospace `Txt` sets support codes in) own line height in ems: (1901 + 483) / 2048. */
export const MENLO_LINE_HEIGHT = 2384 / 2048;

/**
 * The height iOS gives one line of `fontFamily`, in ems: an embedded font's own (generated from
 * its file), Menlo's, or SF Pro's for the system face (no family) and any other system font.
 */
export function naturalLineHeight(fontFamily: string | undefined): number {
  if (fontFamily === undefined) return SYSTEM_LINE_HEIGHT;
  if (fontFamily === 'Menlo') return MENLO_LINE_HEIGHT;
  return (FONT_LINE_HEIGHT as Readonly<Record<string, number>>)[fontFamily] ?? SYSTEM_LINE_HEIGHT;
}
