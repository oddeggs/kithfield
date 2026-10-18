import type { SkCanvas, SkImage, SkSurface } from '@shopify/react-native-skia';

import type { SkiaCaches } from './caches';
import type { SkiaApi } from './skia-api';

import { ArtContext2D } from './context';
import type { FontBook } from './font';
import type { Affine } from './matrix';

/** What every canvas and context in one renderer instance shares. */
export interface SkiaEnv {
  skia: SkiaApi;
  fonts: FontBook;
  /** Canvas `shadowBlur` to a Gaussian sigma in device pixels. */
  shadowSigma: (blur: number) => number;
  /** Colour filters by CSS `filter` string and gradient shaders by their parameters. */
  caches: SkiaCaches;
  /**
   * Canvases not to draw while set (the critters, when a companion is drawn on its own): drawing
   * one reports the transform it would have been drawn with instead.
   */
  hidden?: { sources: WeakSet<object>; drawn: (m: Affine) => void } | null;
}

/**
 * The `<canvas>` element as the renderer uses it: a size, a 2D context and pixels, here an
 * `SkSurface` made on first draw. Resizing clears it and resets its context, as in the DOM.
 */
export class ArtCanvas {
  readonly style: Record<string, string> = {};
  private w = 300;
  private h = 150;
  private ctx: ArtContext2D | null = null;
  private surf: SkSurface | null = null;
  private image: SkImage | null = null;
  private bytes = 0;

  constructor(readonly env: SkiaEnv) {}

  get width(): number {
    return this.w;
  }
  set width(v: number) {
    this.w = Math.max(0, Math.floor(Number(v)) || 0);
    this.resize();
  }
  get height(): number {
    return this.h;
  }
  set height(v: number) {
    this.h = Math.max(0, Math.floor(Number(v)) || 0);
    this.resize();
  }

  private resize(): void {
    this.release();
    this.ctx?.reset();
  }

  getContext(type: string): ArtContext2D | null {
    if (type !== '2d') return null;
    this.ctx ??= new ArtContext2D(this);
    return this.ctx;
  }

  /** The SkiaApi canvas to draw on, or null for a zero-sized canvas. */
  skCanvas(): SkCanvas | null {
    if (!this.surf) {
      if (this.w === 0 || this.h === 0) return null;
      const { skia } = this.env;
      // CPU raster: snapshots are plain images any thread (and the UI thread's canvas) can draw.
      this.surf = skia.Surface.Make(this.w, this.h);
      if (!this.surf) throw new Error(`Could not make a ${this.w}×${this.h} surface`);
      this.bytes = this.w * this.h * 4;
    }
    this.image = null;
    return this.surf.getCanvas();
  }

  /** The pixels as an image (cached until the next draw), or null when nothing was drawn. */
  snapshot(): SkImage | null {
    if (!this.surf) return null;
    this.image ??= this.surf.makeImageSnapshot();
    return this.image;
  }

  /** Frees the pixels; the next draw starts from a cleared canvas. */
  release(): void {
    this.image = null;
    if (this.surf) {
      this.surf.dispose?.();
      this.surf = null;
      this.bytes = 0;
    }
  }

  /** Bytes held by this canvas's pixels. */
  get byteSize(): number {
    return this.bytes;
  }
}
