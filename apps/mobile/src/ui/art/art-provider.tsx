import { Art, systemFaces, watchMemory, type FrameLoop, type SceneRequest } from '@kithfield/art';
import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, PixelRatio } from 'react-native';

import { ArtStore, type AvatarRequest, type Compositor } from './art-store';

/** Composes layers on a CPU surface and encodes PNGs with Skia. */
const skiaCompositor: Compositor = {
  compose(width, height, dpr, layers) {
    const surface = Skia.Surface.Make(Math.round(width * dpr), Math.round(height * dpr));
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.scale(dpr, dpr);
    const paint = Skia.Paint();
    for (const l of layers) {
      if (!l.image) continue;
      canvas.drawImageRect(
        l.image,
        Skia.XYWHRect(0, 0, l.image.width(), l.image.height()),
        Skia.XYWHRect(l.x, l.y, l.w, l.h),
        paint,
      );
    }
    const image = surface.makeImageSnapshot();
    surface.dispose?.();
    return image;
  },
  encode(image: SkImage) {
    return `data:image/png;base64,${image.encodeToBase64(ImageFormat.PNG, 100)}`;
  },
};

const ArtContext = createContext<ArtStore | null>(null);

/** In development builds, art held still for being too big says so once in the log. */
const devWarn = (message: string) => {
  if (__DEV__) console.warn(message);
};

/** Makes the renderer once, on the fonts the system already has embedded. */
export function createArtStore(onError?: (message: string, error: unknown) => void): ArtStore {
  const art = new Art({ skia: Skia, faces: systemFaces(Skia), ...(onError ? { onError } : {}) });
  return new ArtStore(art, PixelRatio.get(), skiaCompositor, devWarn);
}

/** Provides the art, and flushes its caches on every memory warning. */
export function ArtProvider({
  store,
  children,
}: {
  readonly store: ArtStore;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    const sub = watchMemory(store.art, AppState);
    return () => sub.remove();
  }, [store]);
  return <ArtContext.Provider value={store}>{children}</ArtContext.Provider>;
}

export function useArt(): ArtStore {
  const store = useContext(ArtContext);
  if (store === null) throw new Error('useArt needs an ArtProvider');
  return store;
}

/** A still of `req`, drawn on first use and shared by everything that shows the same drawing. */
export function useArtStill(req: SceneRequest, t = 0): SkImage | null {
  const store = useArt();
  const key = JSON.stringify([req, t]);
  return useMemo(() => store.still(req, t), [store, key]);
}

/** A still as a `data:` URI for a plain `<Image>`, for drawings repeated down a list. */
export function useArtUri(req: SceneRequest, t = 0): string | null {
  const store = useArt();
  const key = JSON.stringify([req, t]);
  return useMemo(() => store.stillUri(req, t), [store, key]);
}

/** An avatar as one encoded image (see `ArtStore.avatarUri`). */
export function useAvatarUri(req: AvatarRequest): string | null {
  const store = useArt();
  const key = JSON.stringify(req);
  return useMemo(() => store.avatarUri(req), [store, key]);
}

/** Runs `fn` once the JS thread is idle; answers how to cancel it. */
export const whenIdle = (fn: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn);
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

/**
 * A loop of `req`, baked when the JS thread is idle so it never holds up a screen's first frame,
 * or null while the art is held still: under Reduce Motion, and for a scene too big to loop whole
 * (told once in development; loop those with `LayeredScene`).
 */
export function useArtLoop(req: SceneRequest, still: boolean): FrameLoop | null {
  const store = useArt();
  const key = JSON.stringify(req);
  const [loop, setLoop] = useState<FrameLoop | null>(null);
  useEffect(() => {
    if (still) {
      setLoop(null);
      return;
    }
    return whenIdle(() => setLoop(store.loop(req)));
  }, [store, key, still]);
  return loop;
}
