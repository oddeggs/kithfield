import type { SkFont, SkTypeface } from '@shopify/react-native-skia';
import type { SkiaApi } from './skia-api';

import { FontEdging, FontHinting } from './skia-enums';

/** One embedded face, by the CSS family the renderer names it with. */
export interface FaceEntry {
  family: string;
  weight: number;
  typeface: SkTypeface;
  /** The OS/2 typo ascender and descender, in font units (both positive). */
  typo?: readonly [ascender: number, descender: number];
}

/** The em box a canvas `top`, `middle` or `bottom` baseline is measured from, in pixels. */
export interface EmBox {
  ascent: number;
  descent: number;
}

/** Blink's layout unit: 1/64 px. */
const layoutUnit = (v: number) => Math.round(v * 64) / 64;

export interface ParsedFont {
  weight: number;
  italic: boolean;
  size: number;
  families: string[];
}

const DEFAULT_FONT: ParsedFont = { weight: 400, italic: false, size: 10, families: ['sans-serif'] };

const WEIGHTS: Record<string, number> = { normal: 400, bold: 700, lighter: 300, bolder: 700 };

/** Parses the CSS `font` shorthand the renderer writes, e.g. `700 20px Gaegu, 'Comic Sans MS'`. */
export function parseFont(css: string): ParsedFont | null {
  const m =
    /^\s*((?:(?:italic|oblique|normal|small-caps|bold|bolder|lighter|\d{3})\s+)*)([\d.]+)px(?:\s*\/\s*[^\s]+)?\s+(.+)$/i.exec(
      css,
    );
  if (!m) return null;
  let weight = 400;
  let italic = false;
  for (const tok of (m[1] ?? '').trim().split(/\s+/).filter(Boolean)) {
    const t = tok.toLowerCase();
    if (/^\d{3}$/.test(t)) weight = Number(t);
    else if (WEIGHTS[t] !== undefined) weight = WEIGHTS[t];
    else if (t === 'italic' || t === 'oblique') italic = true;
  }
  const size = Number(m[2]);
  if (!Number.isFinite(size) || size < 0) return null;
  const families = (m[3] ?? '')
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  return { weight, italic, size, families };
}

export function defaultFont(): ParsedFont {
  return DEFAULT_FONT;
}

/** Synthetic bold, as browsers apply it: asked for bold, given a face lighter than semibold. */
const needsSyntheticBold = (want: number, face: number) => want >= 600 && face < 600;

/**
 * The hand face that writes Vietnamese. Text a scene sets in a face without its letters (a sticker
 * caption in Gaegu) is written wholly in it, a little smaller to sit in the same space, until the
 * renderer picks the face by language itself.
 */
const HAND_FALLBACK = 'Patrick Hand';
const HAND_FALLBACK_SCALE = 0.9;

export interface ResolvedRun {
  font: SkFont;
  glyphs: number[];
  advances: number[];
}

/**
 * The embedded faces and the Skia fonts made from them. Each family in a `font` value is tried in
 * order; a glyph the chosen face lacks falls back to the next listed family that has it.
 */
export class FontBook {
  private fonts = new Map<string, SkFont>();
  /**
   * Characters drawn as a missing glyph (none of the listed faces has them) since the count was
   * last reset. The goldens fail on any: the browser would have used a system font instead.
   */
  missingGlyphs = 0;

  constructor(
    private readonly skia: SkiaApi,
    private readonly faces: readonly FaceEntry[],
  ) {}

  private facesFor(families: readonly string[], weight: number): FaceEntry[] {
    const out: FaceEntry[] = [];
    for (const fam of families) {
      const matches = this.faces.filter((f) => f.family.toLowerCase() === fam.toLowerCase());
      if (matches.length === 0) continue;
      matches.sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight));
      const best = matches[0];
      if (best) out.push(best);
    }
    const fallback = this.faces[0];
    if (out.length === 0 && fallback) out.push(fallback);
    return out;
  }

  private skFont(face: FaceEntry, size: number, weight: number): SkFont {
    const key = `${face.family}|${face.weight}|${size}|${weight}`;
    let f = this.fonts.get(key);
    if (!f) {
      f = this.skia.Font(face.typeface, size);
      f.setEdging(FontEdging.AntiAlias);
      f.setHinting(FontHinting.None);
      f.setSubpixel(true);
      f.setLinearMetrics(true);
      if (needsSyntheticBold(weight, face.weight)) f.setEmbolden(true);
      // Sizes come from layout maths, so the map is bounded rather than trusted to stay small.
      if (this.fonts.size >= 64) this.fonts.clear();
      this.fonts.set(key, f);
    }
    return f;
  }

  /** The primary font for metrics (baselines). */
  primary(font: ParsedFont): SkFont | null {
    const face = this.facesFor(font.families, font.weight)[0];
    return face ? this.skFont(face, font.size, font.weight) : null;
  }

  /**
   * The primary face's em box as Blink measures it for the canvas baselines: the typo ascender
   * and descender scaled to sum to the font size, the ascent rounded to a layout unit. A face
   * without typo metrics uses its ascent and descent instead.
   */
  emBox(font: ParsedFont): EmBox | null {
    const face = this.facesFor(font.families, font.weight)[0];
    if (!face) return null;
    let [ascender, descender] = face.typo ?? [0, 0];
    if (!(ascender > 0)) {
      const metrics = this.skFont(face, font.size, font.weight).getMetrics();
      ascender = Math.round(-metrics.ascent);
      descender = Math.round(metrics.descent);
    }
    const height = ascender + descender;
    if (!(height > 0) || ascender < 0 || ascender > height) return null;
    const ascent = layoutUnit((ascender * font.size) / height);
    return { ascent, descent: layoutUnit(font.size) - ascent };
  }

  /**
   * Splits `text` into runs, each in the first listed face that has its glyphs. Text is
   * normalised to NFC first (Patrick Hand has precomposed Vietnamese, not the combining marks).
   * Glyphs are placed by their advances: GPOS kerning is not applied (measured against Chrome,
   * caption bounds match to the pixel; see the golden text scenes).
   */
  shape(text: string, font: ParsedFont): ResolvedRun[] {
    const nfc = text.normalize('NFC');
    const listed = this.facesFor(font.families, font.weight);
    const hand = this.handFallback(nfc, listed, font);
    const faces = hand ? [hand] : listed;
    const size = hand ? font.size * HAND_FALLBACK_SCALE : font.size;
    const runs: ResolvedRun[] = [];
    let current: ResolvedRun | null = null;
    for (const ch of nfc) {
      let chosen: SkFont | null = null;
      let glyph = 0;
      for (const face of faces) {
        const f = this.skFont(face, size, font.weight);
        const g = f.getGlyphIDs(ch)[0] ?? 0;
        if (g !== 0) {
          chosen = f;
          glyph = g;
          break;
        }
      }
      if (!chosen) {
        if (ch >= ' ') this.missingGlyphs++;
        const first = faces[0];
        if (!first) continue;
        chosen = this.skFont(first, size, font.weight);
      }
      if (!current || current.font !== chosen) {
        current = { font: chosen, glyphs: [], advances: [] };
        runs.push(current);
      }
      current.glyphs.push(glyph);
    }
    for (const run of runs) run.advances = run.font.getGlyphWidths(run.glyphs);
    return runs;
  }

  /**
   * Patrick Hand, when some character of `text` is in none of the listed faces and Patrick Hand
   * has them all; otherwise null.
   */
  private handFallback(
    text: string,
    listed: readonly FaceEntry[],
    font: ParsedFont,
  ): FaceEntry | null {
    const has = (face: FaceEntry, ch: string) =>
      (this.skFont(face, font.size, font.weight).getGlyphIDs(ch)[0] ?? 0) !== 0;
    const chars = [...text].filter((ch) => ch >= ' ' && ch.trim() !== '');
    if (!chars.some((ch) => !listed.some((face) => has(face, ch)))) return null;
    const hand = this.facesFor([HAND_FALLBACK], font.weight).find(
      (f) => f.family.toLowerCase() === HAND_FALLBACK.toLowerCase(),
    );
    return hand && chars.every((ch) => has(hand, ch)) ? hand : null;
  }

  measure(text: string, font: ParsedFont): number {
    let w = 0;
    for (const run of this.shape(text, font)) for (const a of run.advances) w += a;
    return w;
  }
}
