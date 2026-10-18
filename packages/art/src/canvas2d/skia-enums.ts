/**
 * Skia's enum values, as React Native Skia numbers them. They are declared here rather than
 * imported because the package's entry point loads React Native, which Node cannot.
 */
export const BlendMode = {
  Clear: 0,
  Src: 1,
  SrcOver: 3,
  DstOver: 4,
  SrcIn: 5,
  DstIn: 6,
  SrcOut: 7,
  DstOut: 8,
  SrcATop: 9,
  DstATop: 10,
  Xor: 11,
  Plus: 12,
  Screen: 14,
  Overlay: 15,
  Darken: 16,
  Lighten: 17,
  ColorDodge: 18,
  ColorBurn: 19,
  HardLight: 20,
  SoftLight: 21,
  Difference: 22,
  Exclusion: 23,
  Multiply: 24,
  Hue: 25,
  Saturation: 26,
  Color: 27,
  Luminosity: 28,
} as const;

export const PaintStyle = { Fill: 0, Stroke: 1 } as const;
export const StrokeCap = { Butt: 0, Round: 1, Square: 2 } as const;
export const StrokeJoin = { Miter: 0, Round: 1, Bevel: 2 } as const;
export const ClipOp = { Difference: 0, Intersect: 1 } as const;
export const FillType = { Winding: 0, EvenOdd: 1 } as const;
export const TileMode = { Clamp: 0 } as const;
export const FilterMode = { Nearest: 0, Linear: 1 } as const;
export const MipmapMode = { None: 0 } as const;
export const PathVerb = { Move: 0, Line: 1, Quad: 2, Conic: 3, Cubic: 4, Close: 5 } as const;
export const FontEdging = { Alias: 0, AntiAlias: 1, SubpixelAntiAlias: 2 } as const;
export const FontHinting = { None: 0, Slight: 1, Normal: 2, Full: 3 } as const;
export const ColorType = { RGBA_8888: 4 } as const;
export const AlphaType = { Premul: 2, Unpremul: 3 } as const;
export const ImageFormat = { PNG: 4, WEBP: 6 } as const;

/** Interpolate gradient colours premultiplied, as canvas gradients do. */
export const GRADIENT_PREMUL = 1;
