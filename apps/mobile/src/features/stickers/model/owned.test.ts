import { describe, expect, it } from '@jest/globals';
import type { Collection } from '@kithfield/contracts';

import { ownedPacks, ownsPack, packHint } from './owned';

const collection: Collection = {
  items: [
    { item: 'cosy_weather', via: 'bought', from: null, at: Date.UTC(2026, 3, 20) },
    { item: 'lighthouse', via: 'bought', from: null, at: Date.UTC(2026, 3, 1) },
    { item: 'big_feelings', via: 'gift', from: 'pip', at: Date.UTC(2026, 9, 1) },
    { item: 'moon_pack', via: 'bought', from: null, at: Date.UTC(2026, 9, 2) },
  ],
  rewards: [],
};

describe('the packs someone can send from', () => {
  it('always has their own first, even with nothing loaded', () => {
    expect(ownedPacks(null).map((p) => p.pack.id)).toEqual(['mine']);
  });

  it('adds owned packs in the order they came, leaving out what isn’t a pack this app draws', () => {
    expect(ownedPacks(collection).map((p) => p.pack.id)).toEqual([
      'mine',
      'cosy_weather',
      'big_feelings',
    ]);
    expect(ownsPack(collection, 'big_feelings')).toBe(true);
    expect(ownsPack(collection, 'good_luck')).toBe(false);
    expect(ownsPack(null, 'mine')).toBe(true);
  });

  it('says where each came from, in the farm’s own seasons', () => {
    const [mine, cosy, feelings] = ownedPacks(collection);
    if (!mine || !cosy || !feelings) throw new Error('missing packs');
    const north = { timeZone: 'Europe/London', hemisphere: 'north' as const };
    expect(packHint(mine, north)).toEqual({ kind: 'mine' });
    expect(packHint(feelings, north)).toEqual({ kind: 'gift', from: 'pip' });
    expect(packHint(cosy, north)).toEqual({ kind: 'bought', season: 'spring' });
    expect(packHint(cosy, { timeZone: 'Australia/Sydney', hemisphere: 'south' })).toEqual({
      kind: 'bought',
      season: 'autumn',
    });
    expect(packHint(cosy, null)).toEqual({ kind: 'yours' });
  });
});
