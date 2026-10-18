import { describe, expect, it } from 'vitest';

import { isWardrobe, ITEMS } from '../../src/purchases/catalog';
import { cartFor, cartHistory, cartItems, weekIndexOf } from '../../src/purchases/rotation';

const wardrobe = ITEMS.filter(isWardrobe).map((i) => i.item);

describe("Rocco's cart", () => {
  it('brings every wardrobe item round at least twice in any 52 weeks', () => {
    const first = weekIndexOf(Date.UTC(2026, 0, 1));
    for (let start = first; start < first + 104; start++) {
      const seen = new Map<string, number>();
      for (let w = start; w < start + 52; w++) {
        for (const item of cartItems(w)) seen.set(item, (seen.get(item) ?? 0) + 1);
      }
      for (const item of wardrobe) expect(seen.get(item) ?? 0, item).toBeGreaterThanOrEqual(2);
    }
  });

  it('holds 8 to 12 different items, never sticker packs or themes', () => {
    const first = weekIndexOf(Date.UTC(2026, 0, 1));
    for (let w = first; w < first + 60; w++) {
      const items = cartItems(w);
      expect(items.length).toBeGreaterThanOrEqual(8);
      expect(items.length).toBeLessThanOrEqual(12);
      expect(new Set(items).size).toBe(items.length);
      for (const item of items) expect(wardrobe).toContain(item);
    }
  });

  it('is the same all week, from Monday', () => {
    const monday = Date.UTC(2026, 9, 19, 0, 0);
    const sunday = Date.UTC(2026, 9, 25, 23, 59);
    expect(cartFor(monday)).toEqual(cartFor(sunday));
    expect(cartFor(monday).week).toBe('2026-10-19');
    expect(cartFor(sunday + 60_000).week).toBe('2026-10-26');
  });

  it('keeps seasonal items to their months', () => {
    const july = weekIndexOf(Date.UTC(2026, 6, 6));
    for (let w = july; w < july + 3; w++) expect(cartItems(w)).not.toContain('igloo');
  });

  it('says when an item was last here and the season it comes back', () => {
    const now = Date.UTC(2026, 9, 21);
    const { lastOnCart, back } = cartHistory('lighthouse', now);
    expect(lastOnCart).not.toBeNull();
    expect(lastOnCart! < '2026-10-19').toBe(true);
    expect(back).not.toBeNull();
  });
});
