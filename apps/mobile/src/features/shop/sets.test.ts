import { describe, expect, it } from '@jest/globals';
import type { ShopSet } from '@kithfield/contracts';

import { closestSet, progressOf } from './sets';

const set = (id: string, items: string[]): ShopSet => ({
  set: id,
  items,
  reward: { sticker: 'boat', pose: 'row' },
});
const riverbank = set('riverbank', ['houseboat', 'umbrella', 'duckling', 'mossy']);
const orchard = set('orchard', ['treehouse', 'bee', 'golden', 'chime']);

describe('matching sets', () => {
  it('says what is still to find, in the set’s order', () => {
    const p = progressOf(riverbank, new Set(['houseboat', 'mossy']));
    expect(p.have).toBe(2);
    expect(p.missing).toEqual(['umbrella', 'duckling']);
  });

  it('mentions the unfinished set closest to done', () => {
    const owned = new Set(['houseboat', 'umbrella', 'mossy', 'treehouse']);
    expect(closestSet([orchard, riverbank], owned)?.set.set).toBe('riverbank');
  });

  it('mentions a finished set once nothing else is under way, and none before anything is owned', () => {
    expect(closestSet([riverbank], new Set(riverbank.items))?.missing).toEqual([]);
    expect(closestSet([riverbank, orchard], new Set())).toBeNull();
  });
});
