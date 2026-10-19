import { describe, expect, it } from 'vitest';

import { parseProducts, readProducts } from './products';

describe('the product list', () => {
  it('has every in-app product in docs/products.md, each once', () => {
    const products = readProducts();
    expect(products).toHaveLength(48);
    expect(new Set(products.map((p) => p.id)).size).toBe(48);
  });

  it('sorts products by what they sell', () => {
    const kinds = (kind: string) => readProducts().filter((p) => p.kind === kind).length;
    expect(kinds('subscription')).toBe(3);
    expect(kinds('founding')).toBe(1);
    expect(kinds('cottage')).toBe(8);
    expect(kinds('companion')).toBe(6);
    expect(kinds('coat')).toBe(8);
    expect(kinds('little_thing')).toBe(7);
    expect(kinds('sticker_pack')).toBe(5);
    expect(kinds('gift')).toBe(6);
    expect(kinds('chip_in')).toBe(4);
  });

  it('reads the item, its price and its name from a row', () => {
    const [windmill] = parseProducts(
      [
        '| Product id | Price | Reference name | Display name (en) |',
        '|---|---|---|---|',
        '| `kf.item.windmill` | £4.99 | Cottage: windmill | Windmill |',
        '| `kf.chipin.200` | £2.00 (or £1.99) | Chip-in, 2 | A chip-in |',
      ].join('\n'),
    );
    expect(windmill).toEqual({
      id: 'kf.item.windmill',
      kind: 'cottage',
      price: '£4.99',
      name: 'Windmill',
      item: 'windmill',
    });
  });

  it('takes a chip-in tier at its own price, not its fallback', () => {
    const products = parseProducts(
      [
        '| Product id | Type | Price | Reference name | Display name (en) |',
        '|---|---|---|---|---|',
        '| `kf.chipin.200` | Consumable | £2.00 (or £1.99) | Chip-in, 2 | A chip-in |',
      ].join('\n'),
    );
    expect(products[0]?.price).toBe('£2.00');
  });
});
