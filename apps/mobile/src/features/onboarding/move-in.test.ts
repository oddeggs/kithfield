import { describe, expect, it } from '@jest/globals';
import type { Critter } from '@kithfield/contracts';

import { ApiError } from '../../data/api-client';
import { DEFAULT_COAT } from './critters';
import { firstFarmPending } from '../../ui/session/onboarded';
import { readDraft, type DraftStore } from './draft';
import { moveIn, plantFirstFarm, type MoveInDeps } from './move-in';

const critter: Critter = {
  species: 'fox',
  coat: DEFAULT_COAT,
  mark: null,
  accessory: 'scarf',
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
};

function phone(over: Partial<MoveInDeps> = {}) {
  const values = new Map<string, string>();
  const store: DraftStore = {
    getItem: (key) => values.get(key) ?? null,
    setItemAsync: (key, value) => Promise.resolve(void values.set(key, value)),
  };
  const calls: string[] = [];
  const deps: MoveInDeps = {
    store,
    join: (code) => Promise.resolve(void calls.push(`join ${code}`)),
    createFarm: (farm) => {
      calls.push(`plant ${farm.name}`);
      return Promise.resolve({
        farm: 'f1',
        invite: { code: 'abcd', url: 'https://kithfield.com/i/abcd', expiresAt: null },
      });
    },
    updateProfile: (update) => Promise.resolve(void calls.push(`profile ${update.name ?? ''}`)),
    ...over,
  };
  return { deps, calls, store };
}

const farm = { name: 'The Lot', land: 'meadow', timeZone: 'UTC', hemisphere: 'north' } as const;

describe('moving in', () => {
  it('joins a friend’s farm first, and only then becomes the critter', async () => {
    const p = phone();
    await moveIn('p1', { kind: 'join', code: 'abcd' }, { name: 'Otis', critter }, p.deps);
    expect(p.calls).toEqual(['join abcd', 'profile Otis']);
  });

  it('stays out when the farm is full or the invite is gone', async () => {
    for (const code of ['farm_full', 'invite_invalid'] as const) {
      const p = phone({
        join: () => Promise.reject(new ApiError(code === 'farm_full' ? 409 : 404, code)),
      });
      await expect(
        moveIn('p1', { kind: 'join', code: 'abcd' }, { name: 'Otis', critter }, p.deps),
      ).rejects.toMatchObject({ code });
      expect(p.calls).toEqual([]);
    }
  });

  it('keeps a new farm’s critter on the phone until the farm is planted', async () => {
    const p = phone();
    await moveIn('p1', { kind: 'start' }, { name: 'June', critter }, p.deps);
    expect(p.calls).toEqual([]);
    expect(readDraft(p.store, 'p1')).toEqual({ person: 'p1', name: 'June', critter });
  });

  it('becomes the critter as the farm is planted (the server plants for a profile), then forgets the draft', async () => {
    const p = phone();
    await moveIn('p1', { kind: 'start' }, { name: 'June', critter }, p.deps);
    const planted = await plantFirstFarm('p1', farm, p.deps);
    expect(planted.farm).toBe('f1');
    expect(p.calls).toEqual(['profile June', 'plant The Lot']);
    expect(readDraft(p.store, 'p1')).toBeNull();
    expect(firstFarmPending(p.store, 'p1')).toBe(false);
  });

  it('stays out while the farm isn’t planted, even with a profile', async () => {
    const p = phone({ createFarm: () => Promise.reject(new ApiError(503, 'unavailable')) });
    await moveIn('p1', { kind: 'start' }, { name: 'June', critter }, p.deps);
    expect(firstFarmPending(p.store, 'p1')).toBe(true);
    await expect(plantFirstFarm('p1', farm, p.deps)).rejects.toBeInstanceOf(ApiError);
    expect(readDraft(p.store, 'p1')).not.toBeNull();
    expect(firstFarmPending(p.store, 'p1')).toBe(true);
  });

  it('keeps another person’s draft apart', async () => {
    const p = phone();
    await moveIn('p1', { kind: 'start' }, { name: 'June', critter }, p.deps);
    expect(readDraft(p.store, 'p2')).toBeNull();
  });
});
