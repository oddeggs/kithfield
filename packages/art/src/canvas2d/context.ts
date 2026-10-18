import type { SkCanvas, SkPaint, SkPath } from '@shopify/react-native-skia';

import type { ArtCanvas } from './canvas';
import { parseColor, serializeColor } from './color';
import { parseFont } from './font';
import { parseFilter, toColorFilter } from './filter';
import { invert, isInvertible, multiply, toSkia, type Affine } from './matrix';
import { PathData, transformCmds, type PathCmd } from './path';
import { ArtPath2D } from './path2d';
import { BlendMode, ClipOp, FillType, PaintStyle } from './skia-enums';
import {
  ArtGradient,
  CAPS,
  COMPOSITE,
  copyState,
  initialState,
  JOINS,
  UNBOUNDED,
  type DrawState,
  type Style,
} from './state';
import { drawImageOn, drawTextOn } from './draw';

type Rule = 'nonzero' | 'evenodd';
const ruleOf = (r: unknown): number => (r === 'evenodd' ? FillType.EvenOdd : FillType.Winding);

/**
 * The subset of `CanvasRenderingContext2D` the design's renderer calls, drawn with Skia.
 *
 * The Skia canvas's own matrix stays identity: the current path is kept in device space (canvas
 * maps each point by the transform current when it is added), fills and clips draw it as is, and
 * strokes, images and text map back through the current transform, which is applied for just that
 * draw. Clips follow `save`/`restore` through Skia's own save stack.
 */
export class ArtContext2D {
  s: DrawState = initialState();
  private stack: DrawState[] = [];
  private path = new PathData();
  /** Composite modes swapped for others while drawing one layer on its own (see `critter`). */
  compositeOverride: Readonly<Record<string, string>> | null = null;

  constructor(readonly canvas: ArtCanvas) {}

  get env() {
    return this.canvas.env;
  }

  /** Back to a new context's state, as resizing the canvas does. */
  reset(): void {
    this.s = initialState();
    this.stack = [];
    this.path.reset();
  }

  sk(): SkCanvas | null {
    return this.canvas.skCanvas();
  }

  // ---- state ----
  save(): void {
    this.stack.push(copyState(this.s));
    this.sk()?.save();
  }
  restore(): void {
    const prev = this.stack.pop();
    if (!prev) return;
    this.s = prev;
    this.sk()?.restore();
  }

  get globalAlpha(): number {
    return this.s.alpha;
  }
  set globalAlpha(v: number) {
    if (Number.isFinite(v) && v >= 0 && v <= 1) this.s.alpha = v;
  }
  get globalCompositeOperation(): string {
    return this.s.op;
  }
  set globalCompositeOperation(v: string) {
    const name = this.compositeOverride?.[v] ?? v;
    const mode = COMPOSITE[name];
    if (mode === undefined) return;
    this.s.op = v;
    this.s.blend = mode;
  }
  get fillStyle(): string | ArtGradient {
    return this.styleOut(this.s.fill);
  }
  set fillStyle(v: string | ArtGradient) {
    const st = this.styleIn(v);
    if (st) this.s.fill = st;
  }
  get strokeStyle(): string | ArtGradient {
    return this.styleOut(this.s.stroke);
  }
  set strokeStyle(v: string | ArtGradient) {
    const st = this.styleIn(v);
    if (st) this.s.stroke = st;
  }
  private styleIn(v: unknown): Style | null {
    if (v instanceof ArtGradient) return { css: null, gradient: v };
    const color = parseColor(String(v));
    return color ? { css: serializeColor(color), color } : null;
  }
  private styleOut(s: Style): string | ArtGradient {
    return s.css === null ? s.gradient : s.css;
  }

  get lineWidth(): number {
    return this.s.lineWidth;
  }
  set lineWidth(v: number) {
    if (Number.isFinite(v) && v > 0) this.s.lineWidth = v;
  }
  get lineCap(): string {
    return this.s.lineCap;
  }
  set lineCap(v: string) {
    if (CAPS[v] !== undefined) this.s.lineCap = v;
  }
  get lineJoin(): string {
    return this.s.lineJoin;
  }
  set lineJoin(v: string) {
    if (JOINS[v] !== undefined) this.s.lineJoin = v;
  }
  get miterLimit(): number {
    return this.s.miterLimit;
  }
  set miterLimit(v: number) {
    if (Number.isFinite(v) && v > 0) this.s.miterLimit = v;
  }
  setLineDash(segments: number[]): void {
    if (!segments.every((n) => Number.isFinite(n) && n >= 0)) return;
    this.s.dash = segments.length % 2 ? [...segments, ...segments] : segments.slice();
  }
  getLineDash(): number[] {
    return this.s.dash.slice();
  }
  get lineDashOffset(): number {
    return this.s.dashOffset;
  }
  set lineDashOffset(v: number) {
    if (Number.isFinite(v)) this.s.dashOffset = v;
  }
  get font(): string {
    return this.s.font;
  }
  set font(v: string) {
    const f = parseFont(String(v));
    if (!f) return;
    this.s.font = String(v);
    this.s.parsedFont = f;
  }
  get textAlign(): string {
    return this.s.textAlign;
  }
  set textAlign(v: string) {
    if (['start', 'end', 'left', 'right', 'center'].includes(v)) this.s.textAlign = v;
  }
  get textBaseline(): string {
    return this.s.textBaseline;
  }
  set textBaseline(v: string) {
    if (['top', 'hanging', 'middle', 'alphabetic', 'ideographic', 'bottom'].includes(v)) {
      this.s.textBaseline = v;
    }
  }
  get filter(): string {
    return this.s.filter;
  }
  set filter(v: string) {
    const chain = parseFilter(String(v));
    if (!chain) return;
    this.s.filter = String(v);
    this.s.colorFilter = toColorFilter(this.env.skia, chain);
  }
  get shadowColor(): string {
    return serializeColor(this.s.shadowColor);
  }
  set shadowColor(v: string) {
    const c = parseColor(String(v));
    if (c) this.s.shadowColor = c;
  }
  get shadowBlur(): number {
    return this.s.shadowBlur;
  }
  set shadowBlur(v: number) {
    if (Number.isFinite(v) && v >= 0) this.s.shadowBlur = v;
  }
  get shadowOffsetX(): number {
    return this.s.shadowOffsetX;
  }
  set shadowOffsetX(v: number) {
    if (Number.isFinite(v)) this.s.shadowOffsetX = v;
  }
  get shadowOffsetY(): number {
    return this.s.shadowOffsetY;
  }
  set shadowOffsetY(v: number) {
    if (Number.isFinite(v)) this.s.shadowOffsetY = v;
  }
  get imageSmoothingEnabled(): boolean {
    return this.s.smoothing;
  }
  set imageSmoothingEnabled(v: boolean) {
    this.s.smoothing = !!v;
  }

  // ---- transforms ----
  private setM(m: Affine): void {
    this.s.m = m;
  }
  translate(x: number, y: number): void {
    if (Number.isFinite(x) && Number.isFinite(y)) this.setM(multiply(this.s.m, [1, 0, 0, 1, x, y]));
  }
  scale(x: number, y: number): void {
    if (Number.isFinite(x) && Number.isFinite(y)) this.setM(multiply(this.s.m, [x, 0, 0, y, 0, 0]));
  }
  rotate(a: number): void {
    if (!Number.isFinite(a)) return;
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.setM(multiply(this.s.m, [c, s, -s, c, 0, 0]));
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const n: Affine = [a, b, c, d, e, f];
    if (n.every(Number.isFinite)) this.setM(multiply(this.s.m, n));
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const n: Affine = [a, b, c, d, e, f];
    if (n.every(Number.isFinite)) this.setM(n);
  }
  resetTransform(): void {
    this.setM([1, 0, 0, 1, 0, 0]);
  }
  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    const [a, b, c, d, e, f] = this.s.m;
    return { a, b, c, d, e, f };
  }

  // ---- the current path ----
  beginPath(): void {
    this.path.reset();
  }
  moveTo(x: number, y: number): void {
    this.path.moveTo(this.s.m, x, y);
  }
  lineTo(x: number, y: number): void {
    this.path.lineTo(this.s.m, x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.path.quadraticCurveTo(this.s.m, cx, cy, x, y);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void {
    this.path.bezierCurveTo(this.s.m, a, b, c, d, x, y);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void {
    this.path.arc(this.s.m, x, y, r, a0, a1, !!ccw);
  }
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    a0: number,
    a1: number,
    ccw?: boolean,
  ): void {
    this.path.ellipse(this.s.m, x, y, rx, ry, rot, a0, a1, !!ccw);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.path.rect(this.s.m, x, y, w, h);
  }
  closePath(): void {
    this.path.closePath();
  }

  // ---- drawing ----
  private skPath(cmds: readonly PathCmd[], rule: number): SkPath | null {
    if (cmds.length === 0) return null;
    const { skia } = this.env;
    const p = skia.Path.MakeFromCmds(cmds as PathCmd[]);
    if (!p || rule === FillType.Winding) return p;
    return skia.PathBuilder.MakeFromPath(p).setFillType(rule).detach();
  }

  /** Device-space commands for `fill`/`clip` of the current path or a `Path2D`. */
  private deviceCmds(path: ArtPath2D | undefined): readonly PathCmd[] {
    return path ? path.cmdsIn(this.s.m) : this.path.cmds;
  }

  private paintFor(style: Style, local: Affine | null): SkPaint | null {
    const { skia } = this.env;
    const paint = skia.Paint();
    paint.setAntiAlias(true);
    if (style.css !== null) {
      const [r, g, b, a] = style.color;
      paint.setColor(skia.Color(new Float32Array([r, g, b, a * this.s.alpha])));
    } else {
      const shader = style.gradient.shader(skia, local);
      if (!shader) return null;
      paint.setShader(shader);
      paint.setAlphaf(this.s.alpha);
    }
    return paint;
  }

  /** Draws through the composite mode, the CSS filter and the shadow, as canvas does. */
  composite(sk: SkCanvas, paint: SkPaint, draw: (p: SkPaint) => void): void {
    const { skia } = this.env;
    const mode = this.s.blend;
    if (this.s.colorFilter) paint.setColorFilter(this.s.colorFilter);
    const [, , , sa] = this.s.shadowColor;
    const shadow =
      sa > 0 && (this.s.shadowBlur > 0 || this.s.shadowOffsetX !== 0 || this.s.shadowOffsetY !== 0);
    if (!shadow && !UNBOUNDED.has(mode)) {
      paint.setBlendMode(mode);
      draw(paint);
      return;
    }
    const layer = skia.Paint();
    layer.setBlendMode(mode);
    if (shadow) {
      const sigma = this.env.shadowSigma(this.s.shadowBlur);
      layer.setImageFilter(
        skia.ImageFilter.MakeDropShadow(
          this.s.shadowOffsetX,
          this.s.shadowOffsetY,
          sigma,
          sigma,
          skia.Color(new Float32Array(this.s.shadowColor)),
        ),
      );
    }
    sk.saveLayer(layer);
    paint.setBlendMode(BlendMode.SrcOver);
    draw(paint);
    sk.restore();
  }

  private fillCmds(cmds: readonly PathCmd[], rule: number): void {
    const sk = this.sk();
    if (!sk || !isInvertible(this.s.m)) return;
    const path = this.skPath(cmds, rule);
    const paint = path && this.paintFor(this.s.fill, this.s.m);
    if (!path || !paint) return;
    this.composite(sk, paint, (p) => sk.drawPath(path, p));
  }

  private strokeUserCmds(cmds: readonly PathCmd[]): void {
    const sk = this.sk();
    if (!sk || !isInvertible(this.s.m)) return;
    const path = this.skPath(cmds, FillType.Winding);
    const paint = path && this.paintFor(this.s.stroke, null);
    if (!path || !paint) return;
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(this.s.lineWidth);
    paint.setStrokeCap(CAPS[this.s.lineCap] ?? 0);
    paint.setStrokeJoin(JOINS[this.s.lineJoin] ?? 0);
    paint.setStrokeMiter(this.s.miterLimit);
    if (this.s.dash.length > 0 && this.s.dash.some((d) => d > 0)) {
      paint.setPathEffect(this.env.skia.PathEffect.MakeDash(this.s.dash, this.s.dashOffset));
    }
    sk.save();
    sk.concat(toSkia(this.s.m));
    this.composite(sk, paint, (p) => sk.drawPath(path, p));
    sk.restore();
  }

  fill(a?: ArtPath2D | Rule, b?: Rule): void {
    const path = a instanceof ArtPath2D ? a : undefined;
    this.fillCmds(this.deviceCmds(path), ruleOf(path ? b : a));
  }

  stroke(path?: ArtPath2D): void {
    if (path) return this.strokeUserCmds(path.data.cmds);
    const inv = invert(this.s.m);
    if (inv) this.strokeUserCmds(transformCmds(this.path.cmds, inv));
  }

  clip(a?: ArtPath2D | Rule, b?: Rule): void {
    const sk = this.sk();
    if (!sk) return;
    const path = a instanceof ArtPath2D ? a : undefined;
    const p = this.skPath(this.deviceCmds(path), ruleOf(path ? b : a));
    // An empty path clips everything out.
    sk.clipPath(p ?? this.env.skia.Path.Make(), ClipOp.Intersect, true);
  }

  private rectCmds(x: number, y: number, w: number, h: number): PathCmd[] {
    const d = new PathData();
    d.rect(this.s.m, x, y, w, h);
    return d.cmds;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    if (![x, y, w, h].every(Number.isFinite) || w === 0 || h === 0) return;
    this.fillCmds(this.rectCmds(x, y, w, h), FillType.Winding);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    if (![x, y, w, h].every(Number.isFinite)) return;
    const d = new PathData();
    d.rect(null, x, y, w, h);
    this.strokeUserCmds(d.cmds);
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const sk = this.sk();
    if (!sk || ![x, y, w, h].every(Number.isFinite) || w === 0 || h === 0) return;
    const path = this.skPath(this.rectCmds(x, y, w, h), FillType.Winding);
    if (!path) return;
    const paint = this.env.skia.Paint();
    paint.setAntiAlias(true);
    paint.setBlendMode(BlendMode.Clear);
    sk.drawPath(path, paint);
  }

  drawImage(source: ArtCanvas, ...args: number[]): void {
    drawImageOn(this, source, args);
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    drawTextOn(this, String(text), x, y, maxWidth, false);
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    drawTextOn(this, String(text), x, y, maxWidth, true);
  }

  measureText(text: string): { width: number } {
    return { width: this.env.fonts.measure(String(text), this.s.parsedFont) };
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): ArtGradient {
    return new ArtGradient('linear', [x0, y0, x1, y1]);
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): ArtGradient {
    if (r0 < 0 || r1 < 0) throw new RangeError('The radius provided is negative.');
    return new ArtGradient('radial', [x0, y0, r0, x1, y1, r1]);
  }

  /** Paint for a stroke or fill style in user space (for text and images drawn under the CTM). */
  userPaint(stroke: boolean): SkPaint | null {
    return this.paintFor(stroke ? this.s.stroke : this.s.fill, null);
  }
}
