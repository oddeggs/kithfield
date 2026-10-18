import { describe, expect, it } from '@jest/globals';
import type { Species } from '@kithfield/contracts';

import { FIELD_SPOTS, HOME_SPOTS, placeFarm } from './scene-layout';

const people = (species: readonly Species[]) =>
  species.map((s, i) => ({ person: `p${i}`, species: s, joinedAt: 1000 + i }));

const ALL: readonly Species[] = [
  'mouse',
  'rabbit',
  'tortoise',
  'fox',
  'duck',
  'bear',
  'hedgehog',
  'otter',
  'frog',
  'capybara',
  'cat',
  'owl',
  'badger',
  'mole',
  'raccoon',
  'sheep',
];

describe('placing critters on the farm', () => {
  it('stands the scene’s own five at their own cottages and spots', () => {
    const p = placeFarm(people(['sheep', 'hedgehog', 'frog', 'mole', 'rabbit']));
    expect(p.critters.find((c) => c.person === 'p0')).toMatchObject({
      house: 'sheep',
      spot: HOME_SPOTS.sheep,
    });
    expect(p.critters.find((c) => c.person === 'p4')).toMatchObject({
      house: 'rabbit',
      spot: HOME_SPOTS.rabbit,
    });
    expect(p.houses).toHaveLength(5);
  });

  it('gives other critters the free cottages, then the field', () => {
    const p = placeFarm(people(['fox', 'owl', 'sheep']));
    const fox = p.critters.find((c) => c.person === 'p0');
    expect(fox?.house).toBe('rabbit');
    expect(p.critters.find((c) => c.person === 'p2')?.house).toBe('sheep');
  });

  it('finds a distinct spot for each of 24 critters, drawn back to front', () => {
    const species = Array.from({ length: 24 }, (_, i) => ALL[i % ALL.length] ?? 'rabbit');
    const p = placeFarm(people(species));
    expect(p.critters).toHaveLength(24);
    expect(new Set(p.critters.map((c) => `${c.spot.x},${c.spot.y}`)).size).toBe(24);
    const ys = p.critters.map((c) => c.spot.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(p.critters.filter((c) => c.house !== null)).toHaveLength(5);
    expect(FIELD_SPOTS).toHaveLength(19);
  });

  it('keeps a dozing cottage for someone who went wandering while one is free', () => {
    const p = placeFarm(people(['sheep', 'frog']), [
      { person: 'gone', species: 'mole', joinedAt: 900 },
    ]);
    expect(p.houses).toContainEqual({ key: 'mole', person: 'gone', former: true });
    expect(p.critters.map((c) => c.person)).not.toContain('gone');
  });

  it('moves nobody and keeps every cottage when someone leaves', () => {
    const all = people(['sheep', 'fox', 'owl', 'frog', 'cat', 'mole', 'bear']);
    const before = placeFarm(all);
    const fox = all[1];
    if (!fox) throw new Error('no fox');
    const after = placeFarm(
      all.filter((p) => p !== fox),
      [fox],
    );
    for (const c of after.critters) {
      expect(c).toEqual(before.critters.find((b) => b.person === c.person));
    }
    expect(after.critters.map((c) => c.person)).not.toContain(fox.person);
    expect(after.houses.map((h) => h.key).sort()).toEqual(before.houses.map((h) => h.key).sort());
    expect(after.houses.find((h) => h.person === fox.person)).toMatchObject({ former: true });
  });

  it('gives each of 24 members a spot of their own, even with people who left', () => {
    const species = Array.from({ length: 26 }, (_, i) => ALL[i % ALL.length] ?? 'rabbit');
    const all = people(species);
    const gone = [all[2], all[7]].flatMap((p) => (p ? [p] : []));
    const p = placeFarm(
      all.filter((x) => !gone.includes(x)),
      gone,
    );
    expect(p.critters).toHaveLength(24);
    expect(new Set(p.critters.map((c) => `${c.spot.x},${c.spot.y}`)).size).toBe(24);
    expect(p.houses).toHaveLength(5);
  });
});
