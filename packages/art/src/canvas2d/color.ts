/** A colour as Skia takes it: red, green, blue and alpha from 0 to 1, unpremultiplied. */
export type Rgba = readonly [number, number, number, number];

export const TRANSPARENT: Rgba = [0, 0, 0, 0];

const NAMED: Record<string, Rgba> = {
  transparent: TRANSPARENT,
  black: [0, 0, 0, 1],
  white: [1, 1, 1, 1],
  red: [1, 0, 0, 1],
  green: [0, 128 / 255, 0, 1],
  blue: [0, 0, 1, 1],
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function hexColor(h: string): Rgba | null {
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  const digit = (i: number) => parseInt(h[i] ?? '0', 16);
  if (h.length === 3 || h.length === 4) {
    const v = (i: number) => (digit(i) * 17) / 255;
    return [v(0), v(1), v(2), h.length === 4 ? v(3) : 1];
  }
  if (h.length === 6 || h.length === 8) {
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [v(0), v(2), v(4), h.length === 8 ? v(6) : 1];
  }
  return null;
}

function channel(s: string): number | null {
  const t = s.trim();
  if (t.endsWith('%')) {
    const n = Number(t.slice(0, -1));
    return Number.isFinite(n) ? clamp01(n / 100) : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? clamp01(n / 255) : null;
}

function alphaOf(s: string | undefined): number | null {
  if (s === undefined) return 1;
  const t = s.trim();
  const n = t.endsWith('%') ? Number(t.slice(0, -1)) / 100 : Number(t);
  return Number.isFinite(n) ? clamp01(n) : null;
}

const cache = new Map<string, Rgba | null>();

/**
 * Parses the CSS colours the renderer writes (`#rgb`, `#rrggbb`, `rgb()`, `rgba()` and a few
 * names). Returns null for anything else, which canvas ignores.
 */
export function parseColor(input: string): Rgba | null {
  const hit = cache.get(input);
  if (hit !== undefined) return hit;
  const s = input.trim().toLowerCase();
  let out: Rgba | null = null;
  if (s.startsWith('#')) out = hexColor(s.slice(1));
  else if (NAMED[s]) out = NAMED[s];
  else {
    const m = /^rgba?\(([^)]*)\)$/.exec(s);
    if (m?.[1] !== undefined) {
      const parts = m[1].includes(',') ? m[1].split(',') : m[1].split(/[\s/]+/).filter(Boolean);
      if (parts.length === 3 || parts.length === 4) {
        const [r, g, b] = parts.slice(0, 3).map(channel);
        const a = alphaOf(parts[3]);
        if (r != null && g != null && b != null && a != null) out = [r, g, b, a];
      }
    }
  }
  if (cache.size > 4096) cache.clear();
  cache.set(input, out);
  return out;
}

/** The colour canvas reports back for a style it accepted. */
export function serializeColor([r, g, b, a]: Rgba): string {
  const to = (v: number) => Math.round(v * 255);
  if (a >= 1) return `#${[r, g, b].map((v) => to(v).toString(16).padStart(2, '0')).join('')}`;
  return `rgba(${to(r)}, ${to(g)}, ${to(b)}, ${Math.round(a * 1000) / 1000})`;
}
