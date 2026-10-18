import type { Affine } from './matrix';
import { PathVerb } from './skia-enums';

/**
 * A canvas path as Skia path commands (`[verb, ...points]`), built with canvas semantics: an
 * implicit subpath for the first point, arcs joined to the current point with a line, the
 * spec's arc-angle rules. Points are mapped through the transform given with each call, so the
 * context's own path is kept in device space exactly as canvas defines it (the transform at the
 * time a point is added applies). Arcs become conics, which affine maps carry exactly.
 */
export type PathCmd = number[];

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const finite = (...v: number[]) => v.every(Number.isFinite);

/** The end angle canvas uses for an arc (Blink's `AdjustEndAngle`, after canonicalising start). */
export function arcSweep(start: number, end: number, ccw: boolean): [number, number] {
  let s = start % TAU;
  if (s < 0) s += TAU;
  let e = end + (s - start);
  if (!ccw && e - s >= TAU) e = s + TAU;
  else if (ccw && s - e >= TAU) e = s - TAU;
  else if (!ccw && s > e) e = s + (TAU - ((s - e) % TAU));
  else if (ccw && s < e) e = s - (TAU - ((e - s) % TAU));
  return [s, e - s];
}

export class PathData {
  cmds: PathCmd[] = [];
  version = 0;
  private open = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;

  reset(): void {
    this.cmds = [];
    this.open = false;
    this.version++;
  }

  get isEmpty(): boolean {
    return this.cmds.length === 0;
  }

  private map(m: Affine | null, x: number, y: number): [number, number] {
    return m ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] : [x, y];
  }

  private pushMove(px: number, py: number): void {
    this.cmds.push([PathVerb.Move, px, py]);
    this.open = true;
    this.startX = this.lastX = px;
    this.startY = this.lastY = py;
    this.version++;
  }

  private pushLine(px: number, py: number): void {
    this.cmds.push([PathVerb.Line, px, py]);
    this.lastX = px;
    this.lastY = py;
    this.version++;
  }

  moveTo(m: Affine | null, x: number, y: number): void {
    if (!finite(x, y)) return;
    const [px, py] = this.map(m, x, y);
    this.pushMove(px, py);
  }

  lineTo(m: Affine | null, x: number, y: number): void {
    if (!finite(x, y)) return;
    const [px, py] = this.map(m, x, y);
    if (!this.open) this.pushMove(px, py);
    else this.pushLine(px, py);
  }

  quadraticCurveTo(m: Affine | null, cx: number, cy: number, x: number, y: number): void {
    if (!finite(cx, cy, x, y)) return;
    const [qx, qy] = this.map(m, cx, cy);
    const [px, py] = this.map(m, x, y);
    if (!this.open) this.pushMove(qx, qy);
    this.cmds.push([PathVerb.Quad, qx, qy, px, py]);
    this.lastX = px;
    this.lastY = py;
    this.version++;
  }

  bezierCurveTo(
    m: Affine | null,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
  ): void {
    if (!finite(c1x, c1y, c2x, c2y, x, y)) return;
    const [ax, ay] = this.map(m, c1x, c1y);
    const [bx, by] = this.map(m, c2x, c2y);
    const [px, py] = this.map(m, x, y);
    if (!this.open) this.pushMove(ax, ay);
    this.cmds.push([PathVerb.Cubic, ax, ay, bx, by, px, py]);
    this.lastX = px;
    this.lastY = py;
    this.version++;
  }

  closePath(): void {
    if (!this.open || this.cmds.length === 0) return;
    this.cmds.push([PathVerb.Close]);
    this.lastX = this.startX;
    this.lastY = this.startY;
    this.version++;
  }

  rect(m: Affine | null, x: number, y: number, w: number, h: number): void {
    if (!finite(x, y, w, h)) return;
    this.moveTo(m, x, y);
    this.lineTo(m, x + w, y);
    this.lineTo(m, x + w, y + h);
    this.lineTo(m, x, y + h);
    this.closePath();
  }

  arc(
    m: Affine | null,
    x: number,
    y: number,
    r: number,
    a0: number,
    a1: number,
    ccw = false,
  ): void {
    this.ellipse(m, x, y, r, r, 0, a0, a1, ccw);
  }

  ellipse(
    m: Affine | null,
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    a0: number,
    a1: number,
    ccw = false,
  ): void {
    if (!finite(x, y, rx, ry, rot, a0, a1)) return;
    if (rx < 0 || ry < 0) throw new RangeError('The radius provided is negative.');
    const [start, sweep] = arcSweep(a0, a1, !!ccw);
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const on = (ux: number, uy: number) => {
      const lx = ux * rx;
      const ly = uy * ry;
      return this.map(m, x + lx * cr - ly * sr, y + lx * sr + ly * cr);
    };
    const [p0x, p0y] = on(Math.cos(start), Math.sin(start));
    if (this.open) this.pushLine(p0x, p0y);
    else this.pushMove(p0x, p0y);
    if (sweep === 0) return;
    if (rx === 0 || ry === 0) {
      const [ex, ey] = on(Math.cos(start + sweep), Math.sin(start + sweep));
      this.pushLine(ex, ey);
      return;
    }
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / HALF_PI - 1e-9));
    const step = sweep / n;
    const w = Math.cos(step / 2);
    for (let i = 0; i < n; i++) {
      const ta = start + i * step;
      const tm = ta + step / 2;
      const tb = ta + step;
      const [cx, cy] = on(Math.cos(tm) / w, Math.sin(tm) / w);
      const [ex, ey] = on(Math.cos(tb), Math.sin(tb));
      this.cmds.push([PathVerb.Conic, cx, cy, ex, ey, w]);
      this.lastX = ex;
      this.lastY = ey;
    }
    this.version++;
  }

  /** Appends `other`'s subpaths, mapped through `m`. */
  addPath(other: PathData, m: Affine | null): void {
    for (const cmd of other.cmds) this.cmds.push(m ? transformCmd(cmd, m) : cmd.slice());
    if (other.cmds.length > 0) {
      this.open = other.open;
      [this.startX, this.startY] = this.map(m, other.startX, other.startY);
      [this.lastX, this.lastY] = this.map(m, other.lastX, other.lastY);
    }
    this.version++;
  }
}

function transformCmd(cmd: PathCmd, m: Affine): PathCmd {
  const out = cmd.slice();
  const verb = cmd[0];
  const pts = verb === PathVerb.Conic ? 2 : (cmd.length - 1) / 2;
  for (let i = 0; i < pts; i++) {
    const x = cmd[1 + i * 2] ?? 0;
    const y = cmd[2 + i * 2] ?? 0;
    out[1 + i * 2] = m[0] * x + m[2] * y + m[4];
    out[2 + i * 2] = m[1] * x + m[3] * y + m[5];
  }
  return out;
}

export function transformCmds(cmds: readonly PathCmd[], m: Affine): PathCmd[] {
  return cmds.map((c) => transformCmd(c, m));
}
