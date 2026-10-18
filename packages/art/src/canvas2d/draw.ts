import type { ArtCanvas } from './canvas';
import type { ArtContext2D } from './context';
import { isInvertible, multiply, toSkia, type Affine } from './matrix';
import { FilterMode, MipmapMode, PaintStyle } from './skia-enums';
import { CAPS, JOINS } from './state';

export type ImageArgs = [number, number] | [number, number, number, number] | number[];

/**
 * Blink draws images without anti-aliasing unless the transform rotates or skews them or the
 * destination is under a device pixel (`ShouldDrawImageAntialiased`).
 */
function imageAntialias(m: Affine, dw: number, dh: number): boolean {
  if (m[1] !== 0 || m[2] !== 0) {
    if (m[0] !== 0 || m[3] !== 0) return true;
    return Math.abs(dw * m[1]) < 1 || Math.abs(dh * m[2]) < 1;
  }
  return Math.abs(dw * m[0]) < 1 || Math.abs(dh * m[3]) < 1;
}

/** `drawImage(source, dx, dy[, dw, dh])` or `drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)`. */
export function drawImageOn(ctx: ArtContext2D, source: ArtCanvas, args: ImageArgs): void {
  if (typeof (source as Partial<ArtCanvas>).snapshot !== 'function') {
    throw new TypeError('drawImage: not a canvas');
  }
  const hidden = ctx.env.hidden;
  if (hidden?.sources.has(source)) {
    hidden.drawn(ctx.s.m);
    return;
  }
  const iw = source.width;
  const ih = source.height;
  if (iw === 0 || ih === 0) {
    throw new Error(
      'InvalidStateError: The image argument is a canvas element with a width or height of 0.',
    );
  }
  let [sx, sy, sw, sh] = [0, 0, iw, ih];
  let dx: number, dy: number, dw: number, dh: number;
  if (args.length === 2) [dx = 0, dy = 0] = args;
  else if (args.length === 4) [dx = 0, dy = 0, dw = iw, dh = ih] = args;
  else if (args.length === 8)
    [sx = 0, sy = 0, sw = 0, sh = 0, dx = 0, dy = 0, dw = 0, dh = 0] = args;
  else throw new TypeError('drawImage: wrong number of arguments');
  dw ??= iw;
  dh ??= ih;
  if (![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite)) return;
  if (sw < 0) [sx, sw] = [sx + sw, -sw];
  if (sh < 0) [sy, sh] = [sy + sh, -sh];
  if (dw < 0) [dx, dw] = [dx + dw, -dw];
  if (dh < 0) [dy, dh] = [dy + dh, -dh];
  if (sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
  // Clip the source to the image, shrinking the destination with it.
  const kx = dw / sw;
  const ky = dh / sh;
  if (sx < 0) [dx, dw, sw, sx] = [dx - sx * kx, dw + sx * kx, sw + sx, 0];
  if (sy < 0) [dy, dh, sh, sy] = [dy - sy * ky, dh + sy * ky, sh + sy, 0];
  if (sx + sw > iw) [dw, sw] = [dw - (sx + sw - iw) * kx, iw - sx];
  if (sy + sh > ih) [dh, sh] = [dh - (sy + sh - ih) * ky, ih - sy];
  if (sw <= 0 || sh <= 0) return;

  const image = source.snapshot();
  const sk = ctx.sk();
  const m = ctx.s.m;
  if (!image || !sk || !isInvertible(m)) return;
  const { skia } = ctx.env;
  const paint = skia.Paint();
  paint.setAlphaf(ctx.s.alpha);
  paint.setAntiAlias(imageAntialias(m, dw, dh));
  const src = skia.XYWHRect(sx, sy, sw, sh);
  const dst = skia.XYWHRect(dx, dy, dw, dh);
  const fm = ctx.s.smoothing ? FilterMode.Linear : FilterMode.Nearest;
  ctx.composite(sk, paint, (p) => {
    sk.save();
    sk.concat(toSkia(m));
    sk.drawImageRectOptions(image, src, dst, fm, MipmapMode.None, p);
    sk.restore();
  });
}

/** How far below `y` the alphabetic baseline sits for the context's `textBaseline`. */
function baselineShift(ctx: ArtContext2D): number {
  const f = ctx.env.fonts.primary(ctx.s.parsedFont);
  if (!f) return 0;
  const metrics = f.getMetrics();
  const ascent = Math.round(-metrics.ascent);
  const descent = Math.round(metrics.descent);
  switch (ctx.s.textBaseline) {
    case 'top':
      return ascent;
    case 'hanging':
      return ascent * 0.8;
    case 'middle':
      return (ascent - descent) / 2;
    case 'bottom':
    case 'ideographic':
      return -descent;
    default:
      return 0;
  }
}

export function drawTextOn(
  ctx: ArtContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number | undefined,
  stroke: boolean,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (maxWidth !== undefined && !(maxWidth > 0)) return;
  const sk = ctx.sk();
  const m = ctx.s.m;
  if (!sk || !isInvertible(m) || text === '') return;
  const runs = ctx.env.fonts.shape(text.replace(/[\t\n\f\r]/g, ' '), ctx.s.parsedFont);
  let width = 0;
  for (const run of runs) for (const a of run.advances) width += a;
  const align = ctx.s.textAlign;
  const ox = align === 'center' ? -width / 2 : align === 'right' || align === 'end' ? -width : 0;
  const by = y + baselineShift(ctx);
  const sx = maxWidth !== undefined && width > maxWidth ? maxWidth / width : 1;
  const paint = ctx.userPaint(stroke);
  if (!paint) return;
  if (stroke) {
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(ctx.s.lineWidth);
    paint.setStrokeCap(CAPS[ctx.s.lineCap] ?? 0);
    paint.setStrokeJoin(JOINS[ctx.s.lineJoin] ?? 0);
    paint.setStrokeMiter(ctx.s.miterLimit);
  }
  const t = sx === 1 ? m : multiply(m, [sx, 0, 0, 1, x * (1 - sx), 0]);
  ctx.composite(sk, paint, (p) => {
    sk.save();
    sk.concat(toSkia(t));
    let pen = x + ox;
    for (const run of runs) {
      const positions = run.advances.map((a) => {
        const pt = { x: pen, y: by };
        pen += a;
        return pt;
      });
      sk.drawGlyphs(run.glyphs, positions, 0, 0, run.font, p);
    }
    sk.restore();
  });
}
