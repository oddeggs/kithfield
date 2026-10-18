import type { SkImage } from '@shopify/react-native-skia';
import type { SkiaApi } from './canvas2d/skia-api';

import { adoptSpriteMap, DEFAULT_CACHE_BYTES, SpriteCache } from './cache';
import { ArtCanvas, type SkiaEnv } from './canvas2d/canvas';
import { FontBook, type FaceEntry } from './canvas2d/font';
import { createHost, type HostElement } from './host/dom';
import type { Internals, KF } from './internals';
import { evaluateArt } from './vendor/kithfield-art-module.generated';

export interface ArtOptions {
  skia: SkiaApi;
  /** The embedded faces by CSS family and weight (see `faceEntries`). */
  faces: readonly FaceEntry[];
  /** `raster` (CPU, the default) or `offscreen` (GPU). */
  surface?: 'raster' | 'offscreen';
  /** The sprite cache's cap in bytes. */
  cacheBytes?: number;
  /** A scene that throws is reported here (the element itself only logs and carries on). */
  onError?: (message: string, error: unknown) => void;
}

/** Attributes as `<kf-art>` takes them: `true` turns a flag on (`"true"`), `false`/`undefined` leaves it off. */
export type SceneAttrs = Record<string, string | number | boolean | undefined>;

export interface SceneRequest {
  scene: string;
  /** CSS pixels. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel (the element's `dpr`, 2 by default). */
  dpr?: number;
  attrs?: SceneAttrs;
}

interface KfElement extends HostElement {
  cv: ArtCanvas;
  bgc: ArtCanvas | null;
  layers: Record<string, ArtCanvas>;
  draw(t: number): void;
  connectedCallback(): void;
}

/**
 * Canvas `shadowBlur` to a Gaussian sigma: half the blur, as the canvas spec defines it (and the
 * best match to Chrome in the golden sticker). Device pixels: canvas shadows ignore the transform.
 */
export const canvasShadowSigma = (blur: number): number => blur / 2;

/** The design's renderer on Skia: scenes as `<kf-art>` draws them, plus the cache behind them. */
export class Art {
  readonly kf: KF;
  readonly internals: Internals;
  readonly cache: SpriteCache;
  readonly env: SkiaEnv;
  private readonly KfArt: new () => KfElement;
  private readonly elements = new Map<string, KfElement>();
  /** Canvases holding a whole critter sprite, for drawing a scene with the critters lifted out. */
  readonly critterCanvases = new WeakSet<ArtCanvas>();
  private onError: (message: string, error: unknown) => void;

  constructor(options: ArtOptions) {
    this.onError =
      options.onError ??
      ((m, e) => {
        console.error(m, e);
      });
    this.cache = new SpriteCache(options.cacheBytes ?? DEFAULT_CACHE_BYTES);
    this.env = {
      skia: options.skia,
      fonts: new FontBook(options.skia, options.faces),
      surface: options.surface ?? 'raster',
      shadowSigma: canvasShadowSigma,
    };
    const { host, element } = createHost(this.env, (m, e) => this.onError(m, e));
    this.kf = evaluateArt(host) as KF;
    const ctor = element();
    if (!this.kf?.internals || !ctor) throw new Error('The art module did not load');
    this.internals = this.kf.internals;
    this.KfArt = ctor as new () => KfElement;
    this.kf.setMotion(true);
    adoptSpriteMap(this.internals.sprites, this.cache, (key, rec) => {
      if (key.startsWith('cr:')) this.critterCanvases.add(rec.cv as ArtCanvas);
    });
  }

  /** A fresh canvas on this renderer's Skia. */
  canvas(width: number, height: number): ArtCanvas {
    const c = new ArtCanvas(this.env);
    c.width = width;
    c.height = height;
    return c;
  }

  private elementFor(req: SceneRequest): KfElement {
    const dpr = req.dpr ?? 2;
    const attrs = Object.entries(req.attrs ?? {})
      .filter(([, v]) => v !== undefined && v !== false)
      .sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify([req.scene, req.width, req.height, dpr, attrs]);
    let el = this.elements.get(key);
    if (el) {
      this.elements.delete(key);
      this.elements.set(key, el);
      return el;
    }
    el = new this.KfArt();
    el.clientWidth = req.width;
    el.clientHeight = req.height;
    el.setAttribute('scene', req.scene);
    el.setAttribute('dpr', String(dpr));
    for (const [name, v] of attrs) el.setAttribute(name, String(v));
    el.connectedCallback();
    this.elements.set(key, el);
    while (this.elements.size > 6) {
      const oldest = this.elements.keys().next().value as string;
      this.releaseElement(oldest);
    }
    return el;
  }

  private releaseElement(key: string): void {
    const el = this.elements.get(key);
    if (!el) return;
    this.elements.delete(key);
    el.cv.release();
    el.bgc?.release();
    for (const l of Object.values(el.layers)) l.release();
  }

  /**
   * Draws `req` at time `t` (seconds) exactly as `<kf-art>` does and returns its canvas. The
   * scene's background is drawn once and kept, as in the browser; only the foreground redraws.
   */
  draw(req: SceneRequest, t: number): ArtCanvas {
    const el = this.elementFor(req);
    el.draw(t);
    return el.cv;
  }

  /** `draw`, as an image. */
  image(req: SceneRequest, t: number): SkImage | null {
    return this.draw(req, t).snapshot();
  }

  /** Drops every cached drawing and live scene, as on a memory warning. */
  flush(): void {
    for (const key of [...this.elements.keys()]) this.releaseElement(key);
    this.cache.flush();
  }
}
