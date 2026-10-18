import type { SkColorFilter, SkShader } from '@shopify/react-native-skia';

/** Skia objects shared by every canvas of one renderer, so repeated styles allocate once. */
export interface SkiaCaches {
  colorFilters: Map<string, SkColorFilter | null>;
  shaders: Map<string, SkShader | null>;
}

export function newCaches(): SkiaCaches {
  return { colorFilters: new Map(), shaders: new Map() };
}

const CACHE_ENTRIES = 256;

/** Stores `value` under `key`, dropping the oldest entry once the map holds 256. */
export function remember<V>(map: Map<string, V>, key: string, value: V): void {
  if (map.size >= CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}
