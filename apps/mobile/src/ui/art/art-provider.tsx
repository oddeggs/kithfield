import {
  Art,
  sceneLoop,
  systemFaces,
  watchMemory,
  type FrameLoop,
  type SceneRequest,
} from '@kithfield/art';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, PixelRatio } from 'react-native';

/**
 * The art's drawings as the app holds them: each scene drawn once into an image, kept until a
 * memory warning, then drawn again on the next request. Drawing runs the renderer on the JS
 * thread, so it happens when a component first needs an image, never per frame.
 */
export class ArtStore {
  private readonly stills = new Map<string, SkImage | null>();
  private readonly loops = new Map<string, FrameLoop>();
  /** The phone's pixels per point: every drawing is made at this density. */
  readonly dpr = PixelRatio.get();

  constructor(readonly art: Art) {}

  /** `req` drawn once at time `t`, at the phone's density. */
  still(req: SceneRequest, t = 0): SkImage | null {
    const full: SceneRequest = { dpr: this.dpr, ...req };
    const key = JSON.stringify([full, t]);
    if (!this.stills.has(key)) this.stills.set(key, this.art.image(full, t));
    return this.stills.get(key) ?? null;
  }

  /** A small scene as a loop on twos (12 frames at 12 fps), drawn once. */
  loop(req: SceneRequest): FrameLoop {
    const full: SceneRequest = { dpr: this.dpr, ...req };
    const key = JSON.stringify(full);
    let loop = this.loops.get(key);
    if (!loop) {
      loop = sceneLoop(this.art, full);
      this.loops.set(key, loop);
    }
    return loop;
  }

  /** Lets go of every drawing (a memory warning); images already on screen stay drawable. */
  flush(): void {
    this.stills.clear();
    this.loops.clear();
  }
}

const ArtContext = createContext<ArtStore | null>(null);

/** Makes the renderer once, on the system's embedded fonts, and flushes it on memory warnings. */
export function createArtStore(onError?: (message: string, error: unknown) => void): ArtStore {
  const art = new Art({ skia: Skia, faces: systemFaces(Skia), ...(onError ? { onError } : {}) });
  return new ArtStore(art);
}

export function ArtProvider({
  store,
  children,
}: {
  readonly store: ArtStore;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    const art = watchMemory(store.art, AppState);
    const own = AppState.addEventListener('memoryWarning', () => store.flush());
    return () => {
      art.remove();
      own.remove();
    };
  }, [store]);
  return <ArtContext.Provider value={store}>{children}</ArtContext.Provider>;
}

export function useArt(): ArtStore {
  const store = useContext(ArtContext);
  if (store === null) throw new Error('useArt needs an ArtProvider');
  return store;
}

/**
 * A still of `req`, drawn on first use. Each distinct request is drawn once per app run (and again
 * only after a memory warning).
 */
export function useArtStill(req: SceneRequest, t = 0): SkImage | null {
  const store = useArt();
  const key = JSON.stringify([req, t]);
  return useMemo(() => store.still(req, t), [store, key]);
}

/** A loop of `req`, or null while Reduce Motion holds the art still. */
export function useArtLoop(req: SceneRequest, still: boolean): FrameLoop | null {
  const store = useArt();
  const key = JSON.stringify(req);
  const [loop, setLoop] = useState<FrameLoop | null>(null);
  useEffect(() => {
    setLoop(still ? null : store.loop(req));
  }, [store, key, still]);
  return loop;
}
