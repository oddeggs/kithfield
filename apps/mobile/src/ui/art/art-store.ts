import {
  critterLayers,
  sceneLoop,
  type Art,
  type CritterLook,
  type CritterState,
  type FrameLoop,
  type SceneRequest,
} from '@kithfield/art';
import type { SkImage } from '@shopify/react-native-skia';

import { avatarFrame } from './avatar-frame';

/** What a composed image needs from Skia: a surface to draw into (passed in, so tests can run). */
export interface Compositor {
  /** Draws `layers` at their places onto a transparent `width`×`height` point image. */
  compose(
    width: number,
    height: number,
    dpr: number,
    layers: readonly { image: SkImage | null; x: number; y: number; w: number; h: number }[],
  ): SkImage | null;
  /** The image as a `data:` URI for a plain `<Image>`. */
  encode(image: SkImage): string;
}

export interface AvatarRequest {
  kind: string;
  look?: CritterLook;
  state?: Exclude<CritterState, 'blink'>;
  size: number;
}

/** An encoded image is held as its text, two bytes a character. */
const uriBytes = (uri: string | null) => (uri?.length ?? 0) * 2;

/**
 * The art's drawings as the app holds them. Each is drawn once on the JS thread when something
 * first needs it, never per frame, and every one counts against the renderer's own capped sprite
 * cache: when the cache lets an entry go (its cap, or a memory warning) it is drawn again on the
 * next request. Images already on screen stay drawable either way.
 */
export class ArtStore {
  private readonly stills = new Map<string, SkImage | null>();
  private readonly uris = new Map<string, string | null>();
  private readonly warned = new Set<string>();

  constructor(
    readonly art: Art,
    /** The phone's pixels per point: every drawing is made at this density. */
    readonly dpr: number,
    private readonly compositor: Compositor,
    /** Hears, once per drawing, art that had to be held still (development builds). */
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  /** Tells `warn` about `key` the first time only. */
  warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(message);
  }

  private hold<T>(map: Map<string, T>, key: string, size: (value: T) => number, make: () => T): T {
    const cacheKey = `${map === this.stills ? 'still' : 'uri'}:${key}`;
    if (map.has(key) && this.art.cache.has(cacheKey)) {
      this.art.cache.touch(cacheKey);
      return map.get(key) as T;
    }
    const value = make();
    map.set(key, value);
    this.art.cache.track(cacheKey, size(value), () => map.delete(key));
    return value;
  }

  private bytes(width: number, height: number): number {
    return Math.round(width * this.dpr) * Math.round(height * this.dpr) * 4;
  }

  /** `req` drawn once at time `t`, at the phone's density. */
  still(req: SceneRequest, t = 0): SkImage | null {
    const full: SceneRequest = { dpr: this.dpr, ...req };
    const bytes = this.bytes(req.width, req.height);
    return this.hold(
      this.stills,
      JSON.stringify([full, t]),
      () => bytes,
      () => this.art.image(full, t),
    );
  }

  /** A still as a `data:` URI, for lists that show many small drawings as plain images. */
  stillUri(req: SceneRequest, t = 0): string | null {
    const key = JSON.stringify(['scene', req, t, this.dpr]);
    return this.hold(this.uris, key, uriBytes, () => {
      const image = this.still(req, t);
      return image ? this.compositor.encode(image) : null;
    });
  }

  /**
   * A critter framed as the design's `avatar` scene frames it, composed from its cached layers
   * (body and coat, marking, outfit, accessory) into one image, then encoded once.
   */
  avatarUri(req: AvatarRequest): string | null {
    const key = JSON.stringify(['avatar', req, this.dpr]);
    return this.hold(this.uris, key, uriBytes, () => {
      const placed = this.avatarLayers(req);
      const image = this.compositor.compose(req.size, req.size, this.dpr, placed);
      return image ? this.compositor.encode(image) : null;
    });
  }

  /** The critter's layers with where each sits in the avatar's circle. */
  avatarLayers(req: AvatarRequest) {
    const frame = avatarFrame(this.art.internals, req.kind, req.size);
    const layers = critterLayers(this.art, frame.kind, req.look ?? {}, {
      size: frame.critterSize,
      state: req.state ?? 'open',
      dir: frame.dir,
      dpr: this.dpr,
    });
    return layers.map((layer) => ({
      key: layer.key,
      image: layer.image,
      x: frame.headX - layer.originX,
      y: frame.headY - layer.originY,
      w: layer.width,
      h: layer.height,
    }));
  }

  /** The avatar's backdrop: the critter's own tint, or its coat's. */
  avatarTint(kind: string, coat: string | undefined): string {
    return avatarFrame(this.art.internals, kind, 1, coat).tint;
  }

  /**
   * A small scene as a loop on twos (12 frames at 12 fps), drawn once and cached by the art. Null
   * for a scene too big to loop whole (over a quarter of the cache): it is then held still, and
   * the first time it is told to `warn`. A full-size scene loops in layers (`LayeredScene`).
   */
  loop(req: SceneRequest): FrameLoop | null {
    try {
      return sceneLoop(this.art, { dpr: this.dpr, ...req });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.warnOnce(
        `loop:${JSON.stringify(req)}`,
        `${req.scene} (${req.width}×${req.height}) is too big to loop whole, so it is held ` +
          'still. Loop it in layers with <LayeredScene> (ui/art/README.md).',
      );
      return null;
    }
  }
}
