/**
 * The sprite cache: every drawing held as pixels, least recently used first out once the total
 * passes the cap, and all of it dropped on a memory warning. It covers the renderer's own sprite
 * map (each critter, cloud and frame the design caches) as well as the layers and loop frames
 * this package draws.
 */
interface Entry {
  bytes: number;
  dispose: () => void;
}

export const DEFAULT_CACHE_BYTES = 96 * 1024 * 1024;

export class SpriteCache {
  private entries = new Map<string, Entry>();
  private total = 0;

  constructor(private capBytes = DEFAULT_CACHE_BYTES) {}

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }

  get cap(): number {
    return this.capBytes;
  }

  setCap(bytes: number): void {
    this.capBytes = bytes;
    this.evict();
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Records `key` as just used. */
  touch(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.entries.set(key, e);
  }

  /** Adds `key` as the most recent entry; older entries go if the cap is passed. */
  track(key: string, bytes: number, dispose: () => void): void {
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.total -= old.bytes;
      if (old.dispose !== dispose) old.dispose();
    }
    this.entries.set(key, { bytes, dispose });
    this.total += bytes;
    this.evict();
  }

  /** Forgets `key` without disposing it (its owner already let it go). */
  forget(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.total -= e.bytes;
  }

  private evict(): void {
    // The newest entry stays even when it alone passes the cap: it is about to be drawn.
    while (this.total > this.capBytes && this.entries.size > 1) {
      const [key, e] = this.entries.entries().next().value as [string, Entry];
      this.entries.delete(key);
      this.total -= e.bytes;
      e.dispose();
    }
  }

  /** Drops everything, as on a memory warning. */
  flush(): void {
    const all = [...this.entries.values()];
    this.entries.clear();
    this.total = 0;
    for (const e of all) e.dispose();
  }
}

interface SpriteRecord {
  cv: { byteSize: number; release(): void };
}

/**
 * Puts the renderer's own sprite map under `cache`: each sprite it stores is tracked by size,
 * each lookup counts as a use, and an evicted sprite leaves the map (it is redrawn when next
 * asked for). `onStore` hears every key stored.
 */
export function adoptSpriteMap(
  map: Map<string, SpriteRecord>,
  cache: SpriteCache,
  onStore?: (key: string, record: SpriteRecord) => void,
): void {
  const get = map.get.bind(map);
  const set = map.set.bind(map);
  const del = map.delete.bind(map);
  const prefix = 'kf:';
  map.get = (key: string) => {
    const v = get(key);
    if (v) cache.touch(prefix + key);
    return v;
  };
  map.set = (key: string, value: SpriteRecord) => {
    set(key, value);
    onStore?.(key, value);
    cache.track(prefix + key, value.cv.byteSize, () => {
      del(key);
      value.cv.release();
    });
    return map;
  };
  map.delete = (key: string) => {
    cache.forget(prefix + key);
    return del(key);
  };
}
