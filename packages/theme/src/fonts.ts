import { FONT_LINE_HEIGHT } from './font-metrics.generated';
import { hand } from './hand';
import { type, type TypeStyle, type TypeStyleKey, type Weight } from './type';

/** One static cut of the display face, used for text designed at sizes below `below`. */
export interface DisplayCut {
  name:
    | 'Fraunces18ptSuperSoft-SemiBold'
    | 'Fraunces36ptSuperSoft-SemiBold'
    | 'Fraunces72ptSuperSoft-SemiBold';
  /** The optical size it is cut at. */
  opsz: number;
  /** The designed sizes it sets: from the previous cut's `below` up to this one. */
  below: number;
  /**
   * Its size over the designed size: the design is drawn in Young Serif, and this keeps each
   * style's x-height, width and line box where the design has them.
   */
  sizeAdjust: number;
}

/**
 * The display face (titles, farm names): Fraunces, fully soft (SOFT 100) and wonky (WONK 1),
 * semibold, cut at three optical sizes. Both languages read in it.
 */
export const display = {
  family: 'Fraunces',
  weight: 600,
  cuts: [
    { name: 'Fraunces18ptSuperSoft-SemiBold', opsz: 18, below: 24, sizeAdjust: 1.06 },
    { name: 'Fraunces36ptSuperSoft-SemiBold', opsz: 36, below: 48, sizeAdjust: 1.07 },
    { name: 'Fraunces72ptSuperSoft-SemiBold', opsz: 72, below: Infinity, sizeAdjust: 1.08 },
  ],
} as const satisfies { family: string; weight: Weight; cuts: readonly DisplayCut[] };

/**
 * The fonts `kithfield-art.js` writes its scenes' words in (sticker captions, the week page,
 * labels), by the names its CSS gives them. The app's own text uses none of them; they stay
 * embedded until the art names the app's faces.
 */
export const artFonts = {
  youngSerif: 'YoungSerif-Regular',
  gaeguBold: 'Gaegu-Bold',
  patrickHand: 'PatrickHand-Regular',
} as const;

/**
 * The embedded fonts, by the name each registers under: the PostScript name, which is also the
 * file name in `@kithfield/theme/fonts/` (iOS finds a font by PostScript name, Android and web by
 * the file or the name it is loaded as).
 */
export const fonts = {
  display18: display.cuts[0].name,
  display36: display.cuts[1].name,
  display72: display.cuts[2].name,
  hand: hand.name,
  ...artFonts,
} as const;

export type FontName = (typeof fonts)[keyof typeof fonts];

export interface FontFace {
  name: FontName;
  /** The family it registers under. */
  family: string;
  weight: Weight;
  /** File name in `@kithfield/theme/fonts/`. */
  file: `${FontName}.ttf`;
}

const face = (name: FontName, family: string, weight: Weight): FontFace => ({
  name,
  family,
  weight,
  file: `${name}.ttf`,
});

/** The fonts the app's own text is set in. */
export const fontFaces: readonly FontFace[] = [
  ...display.cuts.map((c) =>
    face(c.name, `${display.family} ${c.opsz}pt SuperSoft`, display.weight),
  ),
  face(hand.name, hand.family, hand.weight),
];

/** The art's fonts, as `kithfield-art.js` names their families in CSS. */
export const artFontFaces: readonly FontFace[] = [
  face(artFonts.youngSerif, 'Young Serif', 400),
  face(artFonts.gaeguBold, 'Gaegu', 700),
  face(artFonts.patrickHand, 'Patrick Hand', 400),
];

/** The system face (SF Pro) as the design's CSS names it. */
export const systemCss = '-apple-system,system-ui';

/**
 * Vietnamese stacks its marks above capitals, higher than Fraunces' ascender ("Ễ" reaches 1.07
 * em over its 0.98 em), so in Vietnamese no line is set tighter than this, and stacked marks never
 * touch the line above. Kithfield Hand keeps its stacks inside its ascender ("Ẳ" at 746 of 760).
 *
 * Display text must be precomposed (NFC): Fraunces has every precomposed Vietnamese letter but no
 * combining hook above (U+0309) or dot below (U+0323), so decomposed text would fall back to
 * another font inside a word. Normalise user-typed text with `text.normalize('NFC')` before
 * rendering it. Kithfield Hand composes decomposed text itself.
 */
export const vietnamese = {
  /** Wrapping text rises to at least this line height so stacked marks never touch. */
  minLineHeightRatio: 1.4,
} as const;

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

/** The display cut for text designed at `size`. */
export function displayCut(size: number): DisplayCut {
  return display.cuts.find((c) => size < c.below) ?? display.cuts[2];
}

/** The display cut and size that set display text designed at `size`, keeping its line box. */
export function displayAt(size: number): { fontFamily: FontName; fontSize: number } {
  const { name, sizeAdjust } = displayCut(size);
  return { fontFamily: name, fontSize: Math.round(size * sizeAdjust * 4) / 4 };
}

/**
 * The type style `style` as set in `locale`. Both languages share the faces: display text is in
 * Fraunces, sized to keep the design's box, and hand text is in Kithfield Hand at the design's
 * size.
 */
export function fontFor(
  style: TypeStyleKey | TypeStyle,
  locale: string,
  options: FontOptions = {},
): TextFont {
  const s = typeof style === 'string' ? type[style] : style;
  const face: Pick<TextFont, 'fontFamily' | 'fontWeight' | 'fontSize'> =
    s.face === 'display'
      ? displayAt(s.size)
      : s.face === 'hand'
        ? { fontFamily: hand.name, fontSize: s.size }
        : { fontWeight: String(s.weight) as NonNullable<TextFont['fontWeight']>, fontSize: s.size };
  let lineHeight = s.lineHeight;
  if (isVietnamese(locale) && options.multiline) {
    lineHeight = Math.max(lineHeight, Math.round(face.fontSize * vietnamese.minLineHeightRatio));
  }
  return {
    ...face,
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
