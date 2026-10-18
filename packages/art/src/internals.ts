import type { ArtCanvas } from './canvas2d/canvas';
import type { ArtContext2D } from './canvas2d/context';

/** A drawing in the design's cast table (`CR`): its colours and its `draw` function. */
export interface CritterDef {
  seed: number;
  fill: string;
  wash: string;
  tint: string;
  head: [number, number];
  draw(c: ArtContext2D, o: { st: string; lw: number }): void;
  [key: string]: unknown;
}

/** One of the renderer's held sprites. */
export interface Sprite {
  cv: ArtCanvas;
  W: number;
  H: number;
  ox: number;
  oy: number;
}

export interface Scene {
  anim: boolean;
  bg?(c: ArtContext2D, w: number, h: number, o: Record<string, unknown>): unknown;
  fg?(c: ArtContext2D, w: number, h: number, t: number, o: Record<string, unknown>): void;
}

export interface CritterVariant {
  coat?: string | null;
  mark?: string | null;
  outfit?: string | null;
  oc?: string | null;
}

/** The drawing functions and tables the sync hands over from the renderer's closure. */
export interface Internals {
  S: Record<string, Scene>;
  CR: Record<string, CritterDef>;
  COATS: Record<string, Record<string, Record<string, string>>>;
  ANCH: Record<string, Record<string, unknown>>;
  SEASONS: Record<string, Record<string, unknown>>;
  PL: Record<string, unknown[]>;
  NAMES: Record<string, string>;
  LINEUP: string[];
  ROOF: Record<string, string>;
  FRUIT: Record<string, string>;
  RARE: Record<string, Record<string, string>>;
  ICONS: Record<string, (c: ArtContext2D, s: number) => void>;
  sprites: Map<string, Sprite>;
  sprite(
    key: string,
    W: number,
    H: number,
    ox: number,
    oy: number,
    dpr: number,
    fn: (g: ArtContext2D) => void,
  ): Sprite;
  critterSprite(
    kind: string,
    size: number,
    st: string,
    dir: number,
    dpr: number,
    v: CritterVariant | null,
  ): Sprite;
  drawCritter(
    g: ArtContext2D,
    kind: string,
    st: string,
    lw: number,
    v: CritterVariant | null,
  ): void;
  drawMark(
    g: ArtContext2D,
    kind: string,
    mark: string,
    def: CritterDef,
    st: string,
    lw: number,
  ): void;
  drawOutfit(g: ArtContext2D, kind: string, of: string, oc: string | null, lw: number): void;
  local<T>(c: ArtContext2D, x: number, y: number, k: number, fn: () => T): T;
  flame(c: ArtContext2D, x: number, y: number, s: number, t: number, seed?: number): void;
  sparks(c: ArtContext2D, x: number, y: number, s: number, t: number, seed: number): void;
  glow(
    c: ArtContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    a?: number,
    op?: string,
  ): void;
  blinkAt(t: number, ph: number): boolean;
  /** Sets the renderer's px-per-unit and returns the previous value. */
  setU(u: number): number;
}

/** The renderer's `window.KF`. */
export interface KF {
  setMotion(m: boolean): void;
  CR: Record<string, CritterDef>;
  NAMES: Record<string, string>;
  internals: Internals;
}
