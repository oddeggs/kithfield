import { describe, expect, it, jest } from '@jest/globals';
import { SpriteCache, type Art, type SceneRequest } from '@kithfield/art';
import type { SkImage } from '@shopify/react-native-skia';

import { ArtStore, type Compositor } from './art-store';
import { avatarFrame } from './avatar-frame';

const image = (id: number) => ({ id }) as unknown as SkImage;

function storeWith(capBytes: number) {
  let drawn = 0;
  const draw = jest.fn((_req: SceneRequest, _t: number) => image(++drawn));
  const cache = new SpriteCache(capBytes);
  const art = { image: draw, cache } as unknown as Art;
  const compositor: Compositor = {
    compose: () => null,
    encode: (i) => `data:${(i as unknown as { id: number }).id}`,
  };
  return { store: new ArtStore(art, 2, compositor), draw, cache };
}

const icon = (name: string): SceneRequest => ({
  scene: 'icon',
  width: 10,
  height: 10,
  attrs: { name },
});
// 10 × 10 points at 2× is 20 × 20 pixels, 1600 bytes.
const ICON_BYTES = 1600;

describe('the art store', () => {
  it('draws each still once and shares it', () => {
    const { store, draw } = storeWith(1_000_000);
    const a = store.still(icon('farm'));
    const b = store.still(icon('farm'));
    expect(a).toBe(b);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]?.[0]).toMatchObject({ dpr: 2 });
  });

  it('counts its stills against the art’s capped cache and draws again after eviction', () => {
    const { store, draw, cache } = storeWith(ICON_BYTES * 2);
    store.still(icon('farm'));
    store.still(icon('chat'));
    expect(cache.bytes).toBe(ICON_BYTES * 2);
    // A third drawing passes the cap: the least recently used one goes.
    store.still(icon('farm'));
    store.still(icon('seeds'));
    expect(cache.has(`still:${JSON.stringify([{ dpr: 2, ...icon('chat') }, 0])}`)).toBe(false);
    // The touch on the hit kept the farm icon.
    store.still(icon('farm'));
    expect(draw).toHaveBeenCalledTimes(3);
    store.still(icon('chat'));
    expect(draw).toHaveBeenCalledTimes(4);
  });

  it('lets a memory warning drop every still and uri', () => {
    const { store, draw, cache } = storeWith(1_000_000);
    expect(store.stillUri(icon('farm'))).toBe('data:1');
    cache.flush();
    expect(store.stillUri(icon('farm'))).toBe('data:2');
    expect(draw).toHaveBeenCalledTimes(2);
  });
});

describe('the avatar frame', () => {
  const internals = {
    CR: {
      rabbit: { tint: '#f2e0d4', head: [4, -90] },
      sheep: { tint: '#e9e4dc', head: [-10, -70], az: 1.1 },
    },
    COATS: { rabbit: { cocoa: { tint: '#dcb995' } } },
  } as unknown as Parameters<typeof avatarFrame>[0];

  it('centres the head a little above the middle, as the avatar scene does', () => {
    const f = avatarFrame(internals, 'rabbit', 40);
    expect(f.critterSize).toBe(64);
    expect(f.headX).toBeCloseTo(20 - 4 * 0.64);
    expect(f.headY).toBeCloseTo(40 * 0.53 + 90 * 0.64);
    expect(f.dir).toBe(1);
  });

  it('flips the sheep and scales it by its own avatar zoom', () => {
    const f = avatarFrame(internals, 'sheep', 40);
    expect(f.dir).toBe(-1);
    expect(f.critterSize).toBeCloseTo(70.4);
    expect(f.headX).toBeCloseTo(20 - 10 * 0.7);
  });

  it('falls back to the rabbit, and takes a coat’s tint', () => {
    expect(avatarFrame(internals, 'dragon', 30).kind).toBe('rabbit');
    expect(avatarFrame(internals, 'rabbit', 30, 'cocoa').tint).toBe('#dcb995');
    expect(avatarFrame(internals, 'rabbit', 30).tint).toBe('#f2e0d4');
  });
});
