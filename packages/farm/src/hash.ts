import { type FarmId, type Weather } from '@kithfield/contracts';

import { SIGNATURE_POOL, type SignatureId } from './catalog';

/*
 * The farm's only randomness: a seeded hash of recorded facts, so every device gets the same
 * answer and nothing can be rerolled. 32-bit FNV-1a, then MurmurHash3's finaliser to spread the
 * bits. Changing it changes outcomes, so it ships with a rules-version bump.
 */

const fnv1a = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const fmix = (value: number): number => {
  let h = value;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/** A number in [0, 1) that depends only on the given facts. */
export const hashUnit = (...facts: readonly string[]): number =>
  fmix(fnv1a(facts.join('\u001f'))) / 0x1_0000_0000;

/** The rare-variant roll for a blooming plant: `hash(farm, plant, day, weather)`. */
export const rareRoll = (farm: FarmId, plant: string, day: string, weather: Weather): number =>
  hashUnit(farm, plant, day, weather);

/** The farm's signature crop, picked once from the pool by the farm's id. */
export const signatureFor = (farm: FarmId): SignatureId => {
  const index = Math.floor(hashUnit('signature', farm) * SIGNATURE_POOL.length);
  return (SIGNATURE_POOL[index] ?? SIGNATURE_POOL[0]).id;
};
