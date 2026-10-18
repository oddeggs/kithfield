import { isIdentity, type Affine } from './matrix';
import { PathData, transformCmds, type PathCmd } from './path';

interface DomMatrixInit {
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  f?: number;
}

/** `Path2D`: a path in its own user space, mapped by the transform current when it is used. */
export class ArtPath2D {
  readonly data = new PathData();
  private cached: { key: string; version: number; cmds: PathCmd[] } | null = null;

  constructor(from?: ArtPath2D) {
    if (from instanceof ArtPath2D) this.data.addPath(from.data, null);
  }

  /** The commands mapped through `m`, cached for the last transform used. */
  cmdsIn(m: Affine): readonly PathCmd[] {
    if (isIdentity(m)) return this.data.cmds;
    const key = m.join(',');
    const c = this.cached;
    if (c && c.key === key && c.version === this.data.version) return c.cmds;
    const cmds = transformCmds(this.data.cmds, m);
    this.cached = { key, version: this.data.version, cmds };
    return cmds;
  }

  addPath(path: ArtPath2D, t?: DomMatrixInit): void {
    const m: Affine | null = t
      ? [t.a ?? 1, t.b ?? 0, t.c ?? 0, t.d ?? 1, t.e ?? 0, t.f ?? 0]
      : null;
    this.data.addPath(path.data, m);
  }
  moveTo(x: number, y: number): void {
    this.data.moveTo(null, x, y);
  }
  lineTo(x: number, y: number): void {
    this.data.lineTo(null, x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.data.quadraticCurveTo(null, cx, cy, x, y);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void {
    this.data.bezierCurveTo(null, a, b, c, d, x, y);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void {
    this.data.arc(null, x, y, r, a0, a1, !!ccw);
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
    this.data.ellipse(null, x, y, rx, ry, rot, a0, a1, !!ccw);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.data.rect(null, x, y, w, h);
  }
  closePath(): void {
    this.data.closePath();
  }
}
