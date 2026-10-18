import type { SkColorFilter, SkShader } from '@shopify/react-native-skia';
import type { SkiaApi } from './skia-api';

import { remember } from './caches';
import type { SkiaEnv } from './canvas';
import { parseColor, type Rgba } from './color';
import { defaultFont, type ParsedFont } from './font';
import { IDENTITY, toSkia, type Affine } from './matrix';
import { BlendMode, GRADIENT_PREMUL, StrokeCap, StrokeJoin, TileMode } from './skia-enums';

/** A canvas gradient. Its geometry is in the user space current when it is painted. */
export class ArtGradient {
  readonly stops: { offset: number; color: Rgba }[] = [];

  constructor(
    readonly kind: 'linear' | 'radial',
    readonly coords: readonly number[],
  ) {}

  addColorStop(offset: number, color: string): void {
    if (!Number.isFinite(offset) || offset < 0 || offset > 1) {
      throw new RangeError(`The provided value (${offset}) is outside the range (0.0, 1.0).`);
    }
    const rgba = parseColor(String(color));
    if (!rgba)
      throw new SyntaxError(`The value provided ('${color}') could not be parsed as a color.`);
    // Stable: a stop at an offset already used goes after the earlier ones.
    let i = this.stops.length;
    while (i > 0 && (this.stops[i - 1]?.offset ?? 0) > offset) i--;
    this.stops.splice(i, 0, { offset, color: rgba });
  }

  /** The SkiaApi shader, or null when canvas paints nothing (no stops, degenerate geometry). */
  shader(env: SkiaEnv, local: Affine | null): SkShader | null {
    if (this.stops.length === 0) return null;
    const key = `${this.kind}|${this.coords.join(',')}|${this.stops
      .map((s) => `${s.offset}:${s.color.join(',')}`)
      .join(';')}|${local?.join(',') ?? ''}`;
    const hit = env.caches.shaders.get(key);
    if (hit !== undefined) return hit;
    const shader = this.makeShader(env.skia, local);
    remember(env.caches.shaders, key, shader);
    return shader;
  }

  private makeShader(skia: SkiaApi, local: Affine | null): SkShader | null {
    const colors = this.stops.map((s) => skia.Color(new Float32Array(s.color)));
    const pos = this.stops.map((s) => s.offset);
    const matrix = local ? skia.Matrix(toSkia(local)) : undefined;
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = this.coords;
    if (this.kind === 'linear') {
      if (a === c && b === d) return null;
      return skia.Shader.MakeLinearGradient(
        { x: a, y: b },
        { x: c, y: d },
        colors,
        pos,
        TileMode.Clamp,
        matrix,
        GRADIENT_PREMUL,
      );
    }
    if (a === d && b === e && c === f) return null;
    return skia.Shader.MakeTwoPointConicalGradient(
      { x: a, y: b },
      c,
      { x: d, y: e },
      f,
      colors,
      pos,
      TileMode.Clamp,
      matrix,
      GRADIENT_PREMUL,
    );
  }
}

export type Style = { css: string; color: Rgba } | { css: null; gradient: ArtGradient };

export const COMPOSITE: Record<string, number> = {
  'source-over': BlendMode.SrcOver,
  'source-in': BlendMode.SrcIn,
  'source-out': BlendMode.SrcOut,
  'source-atop': BlendMode.SrcATop,
  'destination-over': BlendMode.DstOver,
  'destination-in': BlendMode.DstIn,
  'destination-out': BlendMode.DstOut,
  'destination-atop': BlendMode.DstATop,
  lighter: BlendMode.Plus,
  copy: BlendMode.Src,
  xor: BlendMode.Xor,
  multiply: BlendMode.Multiply,
  screen: BlendMode.Screen,
  overlay: BlendMode.Overlay,
  darken: BlendMode.Darken,
  lighten: BlendMode.Lighten,
  'color-dodge': BlendMode.ColorDodge,
  'color-burn': BlendMode.ColorBurn,
  'hard-light': BlendMode.HardLight,
  'soft-light': BlendMode.SoftLight,
  difference: BlendMode.Difference,
  exclusion: BlendMode.Exclusion,
  hue: BlendMode.Hue,
  saturation: BlendMode.Saturation,
  color: BlendMode.Color,
  luminosity: BlendMode.Luminosity,
};

/**
 * Modes canvas applies to the whole clip, not just under the shape: outside it the destination is
 * cleared (`source-in`, `destination-in`…). They are drawn through a layer, as Blink does.
 */
export const UNBOUNDED = new Set<number>([
  BlendMode.SrcIn,
  BlendMode.SrcOut,
  BlendMode.DstIn,
  BlendMode.DstATop,
  BlendMode.Src,
]);

export const CAPS: Record<string, number> = {
  butt: StrokeCap.Butt,
  round: StrokeCap.Round,
  square: StrokeCap.Square,
};
export const JOINS: Record<string, number> = {
  miter: StrokeJoin.Miter,
  round: StrokeJoin.Round,
  bevel: StrokeJoin.Bevel,
};

export interface DrawState {
  m: Affine;
  fill: Style;
  stroke: Style;
  alpha: number;
  op: string;
  blend: number;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  dash: number[];
  dashOffset: number;
  font: string;
  parsedFont: ParsedFont;
  textAlign: string;
  textBaseline: string;
  filter: string;
  colorFilter: SkColorFilter | null;
  shadowColor: Rgba;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  smoothing: boolean;
}

const BLACK: Rgba = [0, 0, 0, 1];

export function initialState(): DrawState {
  return {
    m: IDENTITY,
    fill: { css: '#000000', color: BLACK },
    stroke: { css: '#000000', color: BLACK },
    alpha: 1,
    op: 'source-over',
    blend: BlendMode.SrcOver,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    dash: [],
    dashOffset: 0,
    font: '10px sans-serif',
    parsedFont: defaultFont(),
    textAlign: 'start',
    textBaseline: 'alphabetic',
    filter: 'none',
    colorFilter: null,
    shadowColor: [0, 0, 0, 0],
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    smoothing: true,
  };
}

export function copyState(s: DrawState): DrawState {
  return { ...s, dash: s.dash.slice() };
}
