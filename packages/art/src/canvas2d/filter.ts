import type { SkColorFilter } from '@shopify/react-native-skia';
import type { SkiaApi } from './skia-api';

/**
 * CSS `filter` strings as Skia colour matrices (Filter Effects 1, §13 "shorthand equivalents"),
 * one matrix per function, applied in order on unpremultiplied sRGB with a clamp after each,
 * which is how the browser runs a canvas filter. The renderer uses brightness, sepia, grayscale,
 * contrast and invert; saturate and opacity are here because they are as simple.
 */
export type ColorMatrix = number[];

// prettier-ignore
const lin = (slope: number, intercept: number): ColorMatrix => [
  slope, 0, 0, 0, intercept,
  0, slope, 0, 0, intercept,
  0, 0, slope, 0, intercept,
  0, 0, 0, 1, 0,
];

/** A 3×3 matrix on red, green and blue, alpha untouched. */
// prettier-ignore
const rgb3 = (m: readonly number[]): ColorMatrix => [
  m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, 0, 0,
  m[3] ?? 0, m[4] ?? 0, m[5] ?? 0, 0, 0,
  m[6] ?? 0, m[7] ?? 0, m[8] ?? 0, 0, 0,
  0, 0, 0, 1, 0,
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function amount(arg: string | undefined, fallback: number): number | null {
  if (arg === undefined || arg.trim() === '') return fallback;
  const t = arg.trim();
  const n = t.endsWith('%') ? Number(t.slice(0, -1)) / 100 : Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function filterFunction(name: string, arg: string | undefined): ColorMatrix | null {
  switch (name) {
    case 'brightness': {
      const a = amount(arg, 1);
      return a === null ? null : lin(a, 0);
    }
    case 'contrast': {
      const a = amount(arg, 1);
      return a === null ? null : lin(a, 0.5 - 0.5 * a);
    }
    case 'invert': {
      const a = amount(arg, 1);
      return a === null ? null : lin(1 - 2 * clamp01(a), clamp01(a));
    }
    case 'grayscale': {
      const a = amount(arg, 1);
      if (a === null) return null;
      const k = 1 - clamp01(a);
      // prettier-ignore
      return rgb3([
        0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k,
        0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k,
        0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k,
      ]);
    }
    case 'sepia': {
      const a = amount(arg, 1);
      if (a === null) return null;
      const k = 1 - clamp01(a);
      // prettier-ignore
      return rgb3([
        0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
        0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
        0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
      ]);
    }
    case 'saturate': {
      const s = amount(arg, 1);
      if (s === null) return null;
      // prettier-ignore
      return rgb3([
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
      ]);
    }
    case 'opacity': {
      const a = amount(arg, 1);
      if (a === null) return null;
      const m = lin(1, 0);
      m[18] = clamp01(a);
      return m;
    }
    default:
      return null;
  }
}

/** The matrices of a CSS filter value in order; `[]` for `none`; null if any part is unsupported. */
export function parseFilter(css: string): ColorMatrix[] | null {
  const s = css.trim().toLowerCase();
  if (s === '' || s === 'none') return [];
  const out: ColorMatrix[] = [];
  const re = /([a-z-]+)\(([^)]*)\)/g;
  let consumed = '';
  for (const m of s.matchAll(re)) {
    const fn = filterFunction(m[1] ?? '', m[2]);
    if (!fn) return null;
    out.push(fn);
    consumed += m[0];
  }
  return consumed.replace(/\s+/g, '') === s.replace(/\s+/g, '') ? out : null;
}

/** One SkiaApi colour filter for the chain, the first function innermost. */
export function toColorFilter(skia: SkiaApi, chain: readonly ColorMatrix[]): SkColorFilter | null {
  let cf: SkColorFilter | null = null;
  for (const m of chain) {
    const next = skia.ColorFilter.MakeMatrix(m);
    cf = cf ? skia.ColorFilter.MakeCompose(next, cf) : next;
  }
  return cf;
}
