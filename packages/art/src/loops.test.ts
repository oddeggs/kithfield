import type { SkImage } from '@shopify/react-native-skia';
import { describe, expect, it } from 'vitest';

import { Art } from './art';
import { diff } from './golden/compare';
import { fireLoop, sceneLoop } from './loops';
import { watchMemory, type MemoryWarnings } from './memory';
import { loadNodeSkia, nodeFaces, premulPixels } from './node';

async function newArt(cacheBytes?: number): Promise<Art> {
  const skia = await loadNodeSkia();
  return new Art({ skia, faces: nodeFaces(skia), ...(cacheBytes ? { cacheBytes } : {}) });
}

const small = { scene: 'firesmall', width: 120, height: 90, attrs: { season: 'summer' } };

/** Reading pixels throws ("deleted object") if the image was disposed under its holder. */
const readable = (images: readonly SkImage[]) => images.every((im) => premulPixels(im).length > 0);

describe('loops on twos', () => {
  it('holds 24 frames of the fire by default and picks them by time', async () => {
    const art = await newArt();
    const loop = fireLoop(art, 80);
    expect(loop.frames).toHaveLength(24);
    expect(loop.indexAt(0.5)).toBe(6);
    expect(loop.indexAt(2.05)).toBe(0);
    const [a, b] = [loop.frames[0], loop.frames[3]];
    if (!a || !b) throw new Error('missing frames');
    expect(diff(premulPixels(a), premulPixels(b)).mean).toBeGreaterThan(0);
  });

  it('returns the cached loop on a repeat request, its frames still drawable', async () => {
    const art = await newArt();
    const first = sceneLoop(art, small, { frames: 4 });
    const again = sceneLoop(art, small, { frames: 4 });
    expect(again).toBe(first);
    expect(readable(first.frames)).toBe(true);
    expect(first.frameAt(0.1)).toBe(first.frames[1]);
  });

  it('keeps handed-out frames drawable through a memory warning', async () => {
    const art = await newArt();
    const loop = sceneLoop(art, small, { frames: 4 });
    const fire = fireLoop(art, 60);
    art.flush();
    expect(readable(loop.frames)).toBe(true);
    expect(readable(fire.frames)).toBe(true);
    expect(sceneLoop(art, small, { frames: 4 })).not.toBe(loop);
  });

  it('keeps handed-out frames drawable when the cache evicts their loop', async () => {
    const art = await newArt(400_000);
    const tiny = { ...small, width: 60, height: 45 };
    const a = sceneLoop(art, tiny, { frames: 2 });
    for (const season of ['winter', 'autumn', 'spring']) {
      sceneLoop(art, { ...tiny, attrs: { season } }, { frames: 2 });
    }
    expect(art.cache.has(`loop:scene:${JSON.stringify(tiny)}:2:12:0`)).toBe(false);
    expect(readable(a.frames)).toBe(true);
  });

  it('refuses a loop larger than a quarter of the cache', async () => {
    const art = await newArt(4_000_000);
    expect(() => sceneLoop(art, { scene: 'farm', width: 390, height: 844, dpr: 3 })).toThrow(
      RangeError,
    );
  });
});

describe('live scenes', () => {
  it('count against the cap and are released, disconnected, when evicted', async () => {
    const art = await newArt(1_000_000);
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      art.draw({ scene: 'firesmall', width: 160, height: 120, attrs: { season } }, 1);
    }
    expect(art.cache.bytes).toBeLessThanOrEqual(1_000_000 + 160 * 120 * 4 * 4 * 3);
    expect(art.liveScenes).toBeLessThan(4);
  });
});

describe('memory warnings', () => {
  it('flush the art once watched, and stop once removed', async () => {
    const art = await newArt();
    let listener: (() => void) | null = null;
    const appState: MemoryWarnings = {
      addEventListener: (_type, l) => {
        listener = l;
        return { remove: () => (listener = null) };
      },
    };
    const sub = watchMemory(art, appState);
    const loop = fireLoop(art, 40);
    expect(art.cache.bytes).toBeGreaterThan(0);
    (listener as (() => void) | null)?.();
    expect(art.cache.bytes).toBe(0);
    expect(readable(loop.frames)).toBe(true);
    sub.remove();
    expect(listener).toBeNull();
  });
});
