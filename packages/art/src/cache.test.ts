import { describe, expect, it } from 'vitest';

import { adoptSpriteMap, SpriteCache } from './cache';

describe('the sprite cache', () => {
  it('drops the least recently used entries past its cap', () => {
    const gone: string[] = [];
    const cache = new SpriteCache(100);
    cache.track('a', 40, () => gone.push('a'));
    cache.track('b', 40, () => gone.push('b'));
    cache.touch('a');
    cache.track('c', 40, () => gone.push('c'));
    expect(gone).toEqual(['b']);
    expect(cache.bytes).toBe(80);
    expect(cache.has('a') && cache.has('c')).toBe(true);
  });

  it('keeps the newest entry even when it alone passes the cap', () => {
    const cache = new SpriteCache(10);
    cache.track('big', 50, () => {});
    expect(cache.has('big')).toBe(true);
  });

  it('flushes everything on a memory warning', () => {
    const gone: string[] = [];
    const cache = new SpriteCache(1000);
    cache.track('a', 1, () => gone.push('a'));
    cache.track('b', 1, () => gone.push('b'));
    cache.flush();
    expect(gone.sort()).toEqual(['a', 'b']);
    expect(cache.bytes).toBe(0);
    expect(cache.size).toBe(0);
  });

  it('puts the renderer’s own sprite map under the cap', () => {
    const released: string[] = [];
    const record = (name: string) => ({
      cv: { byteSize: 60, release: () => released.push(name) },
    });
    const map = new Map<string, ReturnType<typeof record>>();
    const cache = new SpriteCache(100);
    adoptSpriteMap(map, cache);
    map.set('cr:rabbit', record('rabbit'));
    map.set('cloud', record('cloud'));
    expect(released).toEqual(['rabbit']);
    expect(map.has('cr:rabbit')).toBe(false);
    expect(map.get('cloud')).toBeDefined();
    cache.flush();
    expect(map.size).toBe(0);
  });
});
