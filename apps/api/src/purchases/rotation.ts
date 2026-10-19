import type { ArtId, LocalDate, SeasonRef } from '@kithfield/contracts';
import { seasonOf } from '@kithfield/farm';

import { type CatalogItem, isWardrobe, ITEMS } from './catalog';

/*
 * Rocco's cart: a fixed weekly rotation, the same for everyone and worked out from the date alone.
 * Weeks start on Monday (UTC). Each week takes the next ten of the items in season that month, in
 * a stable shuffled order, so everything comes back round many times a year; nothing is ever
 * gone for good and nothing counts down.
 */

const WEEK_MS = 7 * 86_400_000;
/** A Monday: 5 January 1970. */
const FIRST_MONDAY = Date.UTC(1970, 0, 5);

/** How many items the cart brings each week (8 to 12 in the contract). */
export const CART_SIZE = 10;

/** The week's titles, in turn (`shop.cart.<name>` in the app's copy). */
export const CART_NAMES: readonly ArtId[] = [
  'lanterns',
  'riverbank',
  'orchard',
  'teatime',
  'winter_hollow',
  'meadow',
];

/** The week a moment falls in, counted from the first Monday of 1970. */
export const weekIndexOf = (at: number): number => Math.floor((at - FIRST_MONDAY) / WEEK_MS);

const mondayOf = (week: number): number => FIRST_MONDAY + week * WEEK_MS;

export const dayOf = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10);

/** 32-bit FNV-1a: a stable order that never depends on where the code runs. */
const stableHash = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const onCartOrder: readonly CatalogItem[] = ITEMS.filter(isWardrobe)
  .slice()
  .sort(
    (a, b) =>
      stableHash(`cart:${a.item}`) - stableHash(`cart:${b.item}`) || (a.item < b.item ? -1 : 1),
  );

/** The items on the cart in a week. */
export const cartItems = (week: number): ArtId[] => {
  const month = new Date(mondayOf(week)).getUTCMonth() + 1;
  const eligible = onCartOrder.filter((i) => (i.months as readonly number[]).includes(month));
  const n = eligible.length;
  if (n === 0) return [];
  const take = Math.min(CART_SIZE, n);
  const start = (((week * CART_SIZE) % n) + n) % n;
  return Array.from({ length: take }, (_, k) => eligible[(start + k) % n]?.item ?? '').filter(
    (item) => item !== '',
  );
};

/** This week's cart, as `GET /v1/shop/cart` answers it. */
export const cartFor = (at: number) => {
  const week = weekIndexOf(at);
  return {
    week: dayOf(mondayOf(week)),
    name:
      CART_NAMES[((week % CART_NAMES.length) + CART_NAMES.length) % CART_NAMES.length] ??
      'lanterns',
    items: cartItems(week),
  };
};

/** How far the cart looks back and ahead for an item's last and next visit. */
const HORIZON_WEEKS = 104;

/** Every item's last and next visit around now, worked out in one pass over the weeks. */
export const cartHistories = (
  at: number,
): Map<ArtId, { lastOnCart: LocalDate | null; back: SeasonRef | null }> => {
  const week = weekIndexOf(at);
  const out = new Map<ArtId, { lastOnCart: LocalDate | null; back: SeasonRef | null }>();
  const entry = (item: ArtId) => {
    const found = out.get(item) ?? { lastOnCart: null, back: null };
    out.set(item, found);
    return found;
  };
  for (let d = 1; d <= HORIZON_WEEKS; d++) {
    for (const item of cartItems(week - d)) {
      const e = entry(item);
      if (e.lastOnCart === null) e.lastOnCart = dayOf(mondayOf(week - d));
    }
    for (const item of cartItems(week + d)) {
      const e = entry(item);
      if (e.back === null) e.back = seasonOf(dayOf(mondayOf(week + d)), 'north');
    }
  }
  return out;
};

/**
 * When an item was last on the cart (that week's Monday, before this week) and the season it next
 * comes back in (after this week); null when not within two years, or never on the cart.
 */
export const cartHistory = (
  item: ArtId,
  at: number,
): { lastOnCart: LocalDate | null; back: SeasonRef | null } => {
  const week = weekIndexOf(at);
  let lastOnCart: LocalDate | null = null;
  let back: SeasonRef | null = null;
  for (let d = 1; d <= HORIZON_WEEKS && lastOnCart === null; d++) {
    if (cartItems(week - d).includes(item)) lastOnCart = dayOf(mondayOf(week - d));
  }
  for (let d = 1; d <= HORIZON_WEEKS && back === null; d++) {
    if (cartItems(week + d).includes(item)) back = seasonOf(dayOf(mondayOf(week + d)), 'north');
  }
  return { lastOnCart, back };
};
