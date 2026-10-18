import type {
  Collection,
  FarmersWall,
  PatronOffer,
  PersonId,
  ShopCatalog,
  ShopItem,
} from '@kithfield/contracts';
import { PATRON_PRODUCTS } from '@kithfield/contracts';

import {
  catalogItem,
  giftProduct,
  isWardrobe,
  ITEMS,
  productOf,
  SETS,
  setOf,
  THEMES,
  WRAPS,
} from './catalog';
import { FOUNDING_ON_SALE_UNTIL, PATRON_KEEP_ALL } from './config';
import { type KeepOptions, perksOn } from './entitlements';
import { cartHistories } from './rotation';

/* The shop's read-only views: the catalogue, a person's collection, the patron offer and wall. */

/** `GET /v1/shop/catalog`: every item ever sold, the sets, and the free wrappings. */
export const catalogView = (now: number): ShopCatalog => {
  const history = cartHistories(now);
  const items: ShopItem[] = ITEMS.map((i) => {
    const seen = history.get(i.item);
    return {
      item: i.item,
      kind: i.kind,
      slot: i.slot,
      product: productOf(i),
      giftProduct: i.tier === null ? null : giftProduct(i.tier),
      patrons: isWardrobe(i),
      set: setOf(i.item),
      lastOnCart: seen?.lastOnCart ?? null,
      back: seen?.back ?? null,
    };
  });
  for (const theme of THEMES) {
    items.push({
      item: theme,
      kind: 'theme',
      slot: null,
      product: null,
      giftProduct: null,
      patrons: false,
      set: null,
      lastOnCart: null,
      back: null,
    });
  }
  return {
    items,
    sets: SETS.map((s) => ({ set: s.set, items: [...s.items], reward: { ...s.reward } })),
    wraps: [...WRAPS],
  };
};

type OwnedRow = {
  item: string;
  via: Collection['items'][number]['via'];
  from_id: string | null;
  at: number;
};

/** `GET /v1/me/collection`: what the person owns, where from, and the sets they finished. */
export const collectionOf = async (
  db: D1Database,
  person: PersonId,
  { keepAll = PATRON_KEEP_ALL }: KeepOptions = {},
): Promise<Collection> => {
  const withKeeps = keepAll || (await perksOn(db, person, Date.now()));
  const { results } = await db
    .prepare(
      `SELECT item, via, from_id, at FROM owned_items WHERE person_id = ? AND (? OR via <> 'patron')
       ORDER BY at, item`,
    )
    .bind(person, withKeeps ? 1 : 0)
    .all<OwnedRow>();
  const owned = new Set(results.map((r) => r.item));
  return {
    items: results.map((r) => ({ item: r.item, via: r.via, from: r.from_id, at: r.at })),
    rewards: SETS.filter((s) => s.items.every((i) => owned.has(i))).map((s) => ({
      set: s.set,
      ...s.reward,
    })),
  };
};

/** Whether an item may be kept by a patron: anything in the wardrobe. */
export const keepable = (item: string): boolean => {
  const found = catalogItem(item);
  return found !== null && isWardrobe(found);
};

/** `GET /v1/patrons/offer`: Founding Farmer only in the launch season, with no countdown. */
export const patronOffer = (now: number): PatronOffer => {
  const founding = now < FOUNDING_ON_SALE_UNTIL;
  return {
    products: [
      PATRON_PRODUCTS.patronMonthly,
      PATRON_PRODUCTS.patronYearly,
      PATRON_PRODUCTS.farmPlusMonthly,
      ...(founding ? [PATRON_PRODUCTS.founding] : []),
    ],
    founding,
  };
};

const WALL_PAGE = 60;

/** The wall's order: case and accents folded, so "Émile" sits with the e's. */
export const wallSortKey = (name: string) =>
  name.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');

/** `GET /v1/patrons/wall?after=`: names in order, a page at a time, and how many others. */
export const wallPage = async (db: D1Database, after: string | null): Promise<FarmersWall> => {
  const offset = after !== null && /^\d{1,9}$/.test(after) ? Number(after) : 0;
  const { results } = await db
    .prepare('SELECT name FROM wall_names ORDER BY sort_key, person_id LIMIT ? OFFSET ?')
    .bind(WALL_PAGE + 1, offset)
    .all<{ name: string }>();
  const page = results.slice(0, WALL_PAGE);
  const total =
    (await db.prepare('SELECT count(*) AS n FROM wall_names').first<{ n: number }>())?.n ?? 0;
  return {
    names: page.map((r) => r.name),
    others: Math.max(0, total - page.length),
    next: results.length > WALL_PAGE ? String(offset + WALL_PAGE) : null,
  };
};
