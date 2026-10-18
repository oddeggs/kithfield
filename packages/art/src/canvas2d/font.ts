import type { SkFont, SkTypeface } from '@shopify/react-native-skia';
import type { SkiaApi } from './skia-api';

import { FontEdging, FontHinting } from './skia-enums';

/** One embedded face, by the CSS family the renderer names it with. */
export interface FaceEntry {
  family: string;
  weight: number;
  typeface: SkTypeface;
}

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
      this.fonts.set(key, f);
    }
    return f;
  }

  /** The primary font for metrics (baselines). */
  primary(font: ParsedFont): SkFont | null {
    const face = this.facesFor(font.families, font.weight)[0];
    return face ? this.skFont(face, font.size, font.weight) : null;
  }

  /** Splits `text` into runs, each in the first listed face that has its glyphs. */
  shape(text: string, font: ParsedFont): ResolvedRun[] {
    const faces = this.facesFor(font.families, font.weight);
    const runs: ResolvedRun[] = [];
    let current: ResolvedRun | null = null;
    for (const ch of text) {
      let chosen: SkFont | null = null;
      let glyph = 0;
      for (const face of faces) {
        const f = this.skFont(face, font.size, font.weight);
        const g = f.getGlyphIDs(ch)[0] ?? 0;
        if (g !== 0) {
          chosen = f;
          glyph = g;
          break;
        }
      }
      if (!chosen) {
        const first = faces[0];
        if (!first) continue;
        chosen = this.skFont(first, font.size, font.weight);
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

  measure(text: string, font: ParsedFont): number {
    let w = 0;
    for (const run of this.shape(text, font)) for (const a of run.advances) w += a;
    return w;
  }
}
