import { CareFamily, PlantId as PlantIdSchema, RareVariant, Season } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import art from '../../../design/kithfield-art.js?raw';
import {
  FAMILIES,
  FAMILY_PLANTS,
  PLANT_BY_ID,
  PLANTS,
  PORCH_POT,
  RARE_VARIANTS,
  ROSE,
  SEASONS,
  SEASON_START_MONTH,
  SIGNATURE_POOL,
  plantFor,
} from './catalog';

/** Reads what the art renderer can draw straight from the design's art file. */
const block = (name: string) => {
  const match = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`).exec(art);
  if (!match?.[1]) throw new Error(`${name} not found in the art file`);
  return match[1];
};
/** Plant drawings: id → the season the art files it under. */
const artPlants = new Map(
  [...block('PL').matchAll(/(\w+): \['(\w+)'/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
);
const artFruits = new Set([...block('FRUIT').matchAll(/(\w+):/g)].map((m) => m[1]));

describe('plant catalogue', () => {
  it('has 24 family plants, the rose, the signature pool and four porch pot plants', () => {
    const count = (role: string) => PLANTS.filter((p) => p.role === role).length;
    expect(count('family')).toBe(24);
    expect(count('rose')).toBe(1);
    expect(count('signature')).toBe(SIGNATURE_POOL.length);
    expect(count('pot')).toBe(4);
    expect(PLANTS).toHaveLength(29 + SIGNATURE_POOL.length);
  });

  it('has unique ids that fit the wire format', () => {
    expect(new Set(PLANTS.map((p) => p.id)).size).toBe(PLANTS.length);
    expect(PLANT_BY_ID.size).toBe(PLANTS.length);
    for (const p of PLANTS) expect(PlantIdSchema.safeParse(p.id).success, p.id).toBe(true);
  });

  it('grows exactly one plant per family per season', () => {
    expect([...FAMILIES]).toEqual(CareFamily.options);
    expect([...SEASONS]).toEqual(Season.options);
    for (const family of FAMILIES) {
      for (const season of SEASONS) {
        const found = PLANTS.filter((p) => p.family === family && p.season === season);
        expect(
          found.map((p) => p.id),
          `${family} ${season}`,
        ).toEqual([plantFor(family, season)]);
      }
    }
  });

  it('uses the names finalised in design', () => {
    expect(plantFor('gestures', 'winter')).toBe('moonflower');
    expect(plantFor('gatherings', 'winter')).toBe('hellebore');
    expect(PLANT_BY_ID.has('cyclamen' as never)).toBe(false);
    expect(Object.values(FAMILY_PLANTS).flat()).toEqual([
      ...['clover', 'chamomile', 'marigold', 'snowdrop', 'tulip', 'cornflower', 'aster'],
      ...['jasmine', 'daffodil', 'sunflower', 'chrysanthemum', 'camellia', 'sweetpea'],
      ...['lavender', 'heather', 'holly', 'bluebell', 'poppy', 'apple', 'moonflower'],
      ...['blossom', 'strawberry', 'pumpkin', 'hellebore'],
    ]);
  });

  it('can draw every family plant, the rose and every porch pot plant', () => {
    for (const p of PLANTS.filter((p) => p.role !== 'signature')) {
      expect(artPlants.has(p.id), p.id).toBe(true);
    }
  });

  it('files each seasonal plant under the same season as the art', () => {
    for (const p of PLANTS.filter((p) => p.season !== null)) {
      // The moonflower is drawn as a night flower; design moved it to winter.
      const expected = p.id === 'moonflower' ? 'night' : p.season;
      expect(artPlants.get(p.id), p.id).toBe(expected);
    }
    expect(artPlants.get(ROSE.id)).toBe('any');
  });

  it('draws every signature crop as a farm fruit tree and in the field guide', () => {
    expect(SIGNATURE_POOL.map((s) => s.id)).toEqual(['plum', 'persimmon', 'lemon', 'fig']);
    for (const s of SIGNATURE_POOL) {
      expect(artFruits.has(s.fruit), s.fruit).toBe(true);
      expect(s.plant, s.id).toBe(s.id);
      expect(artPlants.get(s.plant), s.plant).toBe('farm');
      expect(Object.values(FAMILY_PLANTS).flat()).not.toContain(s.id);
    }
  });

  it('puts one porch pot plant in each season, drawn in a pot', () => {
    for (const season of SEASONS) {
      const pots = PLANTS.filter((p) => p.role === 'pot' && p.season === season);
      expect(pots.map((p) => p.id)).toEqual([PORCH_POT[season]]);
      expect(pots.every((p) => p.inPot && !p.canBeRare && p.family === null)).toBe(true);
    }
  });

  it('covers every rare variant and flips the seasons for the south', () => {
    expect(RARE_VARIANTS.map((v) => v.id)).toEqual(RareVariant.options);
    for (const season of SEASONS) {
      const north = SEASON_START_MONTH.north[season];
      expect(SEASON_START_MONTH.south[season]).toBe(((north + 5) % 12) + 1);
    }
  });
});
