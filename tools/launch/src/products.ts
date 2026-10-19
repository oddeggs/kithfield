import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './paths';

/** What a product sells, as the review screenshot shows it. */
export type ProductKind =
  | 'subscription'
  | 'founding'
  | 'cottage'
  | 'companion'
  | 'coat'
  | 'little_thing'
  | 'sticker_pack'
  | 'gift'
  | 'chip_in';

export interface Product {
  id: string;
  kind: ProductKind;
  /** The base storefront's proposed price, as written (`£4.99`). */
  price: string;
  /** The display name in English. */
  name: string;
  /** For items: the art id (`kf.item.<item>`). */
  item?: string;
}

const ITEM_KINDS: Record<string, ProductKind> = {
  Cottage: 'cottage',
  Companion: 'companion',
  Coat: 'coat',
  'Little thing': 'little_thing',
  Stickers: 'sticker_pack',
};

const cells = (line: string): string[] =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

const unquote = (cell: string): string => cell.replace(/^`|`$/g, '');

/** The first `£n.nn` in a price cell (a chip-in's cell also names its fallback tier). */
const priceOf = (cell: string): string => /£\d+(?:\.\d{2})?/.exec(cell)?.[0] ?? cell;

/**
 * Every product in `docs/products.md`, from its tables: the patron subscriptions and Founding
 * Farmer, the items (kind from the reference name's prefix), gifts and chip-ins.
 */
export function parseProducts(markdown: string): Product[] {
  const products: Product[] = [];
  let header: string[] = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) {
      header = [];
      continue;
    }
    const row = cells(line);
    if (row.every((c) => /^-+$/.test(c))) continue;
    if (header.length === 0) {
      header = row;
      continue;
    }
    const col = (name: string): string => row[header.indexOf(name)] ?? '';
    const id = unquote(col('Product id'));
    if (!id.startsWith('kf.')) continue;
    const price = priceOf(col('Price'));
    const reference = col('Reference name');
    const name = col('Display name (en)');
    if (id.startsWith('kf.item.')) {
      const prefix = reference.split(':')[0] ?? '';
      const kind = ITEM_KINDS[prefix];
      if (!kind) throw new Error(`${id}: no item kind for "${reference}"`);
      products.push({ id, kind, price, name, item: id.slice('kf.item.'.length) });
    } else if (id.startsWith('kf.gift.')) {
      products.push({ id, kind: 'gift', price, name });
    } else if (id.startsWith('kf.chipin.')) {
      products.push({ id, kind: 'chip_in', price, name });
    } else if (id === 'kf.founding') {
      products.push({ id, kind: 'founding', price, name });
    } else {
      products.push({ id, kind: 'subscription', price, name });
    }
  }
  return products;
}

export function readProducts(): Product[] {
  return parseProducts(readFileSync(join(ROOT, 'docs/products.md'), 'utf8'));
}
