import { describe, expect, it } from '@jest/globals';
import type { ShopItem } from '@kithfield/contracts';

import { fillWord, itemsFor, lowerFirst, onCartNow, orList, roundNote } from './format';

const item = (id: string, over: Partial<ShopItem> = {}): ShopItem => ({
  item: id,
  kind: 'cottage',
  slot: 'cottage',
  product: `kf.item.${id}`,
  giftProduct: 'kf.gift.499',
  patrons: true,
  set: null,
  lastOnCart: null,
  back: null,
  ...over,
});

describe('the shop’s words', () => {
  it('says how full a chip-in is in words, never as an amount', () => {
    expect(fillWord(0)).toBe('start');
    expect(fillWord(0.4)).toBe('filling');
    expect(fillWord(0.8)).toBe('nearly');
    expect(fillWord(1)).toBe('covered');
  });

  it('lists the vote’s options with "or" before the last', () => {
    const or = (rest: string, last: string) => `${rest} or ${last}`;
    expect(orList(['Hare', 'heron', 'hedge-pig'], or)).toBe('Hare, heron or hedge-pig');
    expect(orList(['Hare'], or)).toBe('Hare');
  });

  it('puts a name in the middle of a sentence', () => {
    expect(lowerFirst('Lighthouse')).toBe('lighthouse');
  });
});

describe('the cart', () => {
  const items = [
    item('windmill'),
    item('duckling', { kind: 'companion', slot: 'companion' }),
    item('lighthouse', {
      lastOnCart: '2026-06-01',
      back: { season: 'winter', year: 2026 },
    }),
  ];

  it('shows this week’s items in the cart’s order, and every item of a kind on its tab', () => {
    expect(itemsFor('week', items, ['lighthouse', 'windmill']).map((i) => i.item)).toEqual([
      'lighthouse',
      'windmill',
    ]);
    expect(itemsFor('companion', items, []).map((i) => i.item)).toEqual(['duckling']);
  });

  it('sells for yourself only what is on the cart this week', () => {
    expect(onCartNow(items[0]!, ['windmill'])).toBe(true);
    expect(onCartNow(items[1]!, ['windmill'])).toBe(false);
  });

  it('notes when an item was here and when it comes back', () => {
    expect(roundNote(items)).toEqual({ item: items[2], last: '2026-06-01', back: 'winter' });
    expect(roundNote([items[0]!])).toBeNull();
  });
});
