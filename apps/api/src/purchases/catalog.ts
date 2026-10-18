import {
  type ArtId,
  type CritterSlot,
  itemProduct,
  type ShopItemKind,
  type StoreProductId,
} from '@kithfield/contracts';

/*
 * Everything Rocco's cart has ever sold, its matching sets, the free wrappings and the farm themes.
 * Prices are never here: the store shows its own. Each paid thing has a nominal value in pence at
 * its price tier, used only to tell when friends' chip-in covers it; nobody ever sees it.
 */

/** A month of the northern year, 1 to 12. The cart is the same everywhere. */
type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const ALL_YEAR: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export interface CatalogItem {
  readonly item: ArtId;
  readonly kind: ShopItemKind;
  readonly slot: CritterSlot | null;
  /** The price tier in pence (499 is £4.99 in the base storefront); null for patron-only items. */
  readonly tier: number | null;
  /** Patron-only: patrons keep it, nobody buys it. */
  readonly patronsOnly: boolean;
  /** The months the cart may bring it round. */
  readonly months: readonly Month[];
}

const cottage = (item: ArtId, tier: number | null, months = ALL_YEAR): CatalogItem => ({
  item,
  kind: 'cottage',
  slot: 'cottage',
  tier,
  patronsOnly: tier === null,
  months,
});
const companion = (item: ArtId, tier: number | null): CatalogItem => ({
  item,
  kind: 'companion',
  slot: 'companion',
  tier,
  patronsOnly: tier === null,
  months: ALL_YEAR,
});
const coat = (item: ArtId, tier: number | null, months: readonly Month[]): CatalogItem => ({
  item,
  kind: 'coat',
  slot: 'coat',
  tier,
  patronsOnly: tier === null,
  months,
});
/** Little things that react to friends sit with the critter as its accessory. */
const littleThing = (item: ArtId): CatalogItem => ({
  item,
  kind: 'little_thing',
  slot: 'accessory',
  tier: 199,
  patronsOnly: false,
  months: ALL_YEAR,
});
const stickerPack = (item: ArtId, tier: number): CatalogItem => ({
  item,
  kind: 'sticker_pack',
  slot: null,
  tier,
  patronsOnly: false,
  months: ALL_YEAR,
});

export const ITEMS: readonly CatalogItem[] = [
  cottage('windmill', 499),
  cottage('treehouse', 499),
  cottage('houseboat', 499),
  cottage('lighthouse', 499),
  cottage('mushroom', null),
  cottage('carriage', 499),
  cottage('skep', 499, [5, 6, 7, 8]),
  cottage('teapot', 499),
  cottage('igloo', 399, [11, 12, 1, 2]),
  companion('duckling', 299),
  companion('snail', 299),
  companion('moth', 299),
  companion('butterfly', 299),
  companion('bee', 299),
  companion('ladybird', 299),
  companion('firefly', null),
  coat('moonlit', null, [11, 12, 1, 2]),
  coat('calico', 199, ALL_YEAR),
  coat('golden', 199, [8, 9, 10]),
  coat('frost', 199, [10, 11, 12]),
  coat('aurora', 199, [12, 1, 2]),
  coat('ember', 199, [9, 10, 11]),
  coat('cloud', 199, [3, 4, 5]),
  coat('starry', null, [11, 12, 1]),
  coat('blossom', 199, [3, 4, 5]),
  coat('mossy', 199, [3, 4, 9, 10, 11]),
  littleThing('chime'),
  littleThing('scarf'),
  littleThing('teacup'),
  littleThing('umbrella'),
  littleThing('pinwheel'),
  littleThing('lights'),
  littleThing('vane'),
  stickerPack('out_and_about', 99),
  stickerPack('big_feelings', 149),
  stickerPack('cosy_weather', 99),
  stickerPack('birthday_bloom', 99),
  stickerPack('good_luck', 99),
];

/** Farm themes: friends chip in for one, and once covered it is the farm's forever. */
export const THEMES: readonly ArtId[] = [
  'seaside_cove',
  'cherry_valley',
  'snowy_hollow',
  'mountain_lake',
];

/** What a farm theme is worth, in pence, for telling when a chip-in covers it. */
export const THEME_VALUE = 999;

export interface CatalogSet {
  readonly set: ArtId;
  readonly items: readonly ArtId[];
  readonly reward: { readonly sticker: ArtId; readonly pose: ArtId };
}

/** Matching sets: fixed lists, each finished one unlocks a sticker and a pose. */
export const SETS: readonly CatalogSet[] = [
  {
    set: 'riverbank',
    items: ['houseboat', 'umbrella', 'duckling', 'mossy'],
    reward: { sticker: 'boat', pose: 'row' },
  },
  {
    set: 'lighthouse_keeper',
    items: ['lighthouse', 'moth', 'frost', 'teacup'],
    reward: { sticker: 'window', pose: 'lamp' },
  },
  {
    set: 'orchard',
    items: ['treehouse', 'bee', 'golden', 'chime'],
    reward: { sticker: 'water', pose: 'water' },
  },
  {
    set: 'winter_hollow',
    items: ['igloo', 'firefly', 'cloud', 'lights'],
    reward: { sticker: 'burrito', pose: 'blanket' },
  },
  {
    set: 'teatime',
    items: ['teapot', 'teacup', 'butterfly', 'blossom'],
    reward: { sticker: 'mug', pose: 'tea' },
  },
];

/** The five free wrappings. */
export const WRAPS: readonly ArtId[] = ['clay', 'dusk', 'fern', 'brown_paper', 'plum'];

/** The gift consumable at a price tier: `kf.gift.499`. */
export const giftProduct = (tier: number): StoreProductId =>
  `kf.gift.${String(tier).padStart(3, '0')}`;

/** The chip-in tiers a pledge is made in, in pence: `kf.chipin.100` is £1. */
export const CHIP_IN_TIERS: readonly number[] = [100, 200, 300, 500];

export const chipInProduct = (tier: number): StoreProductId => `kf.chipin.${tier}`;

/** A chip-in product's value in pence, or null when it isn't one. */
export const chipInValue = (product: string): number | null => {
  const match = /^kf\.chipin\.(\d{1,5})$/.exec(product);
  const value = match?.[1] === undefined ? null : Number(match[1]);
  return value !== null && CHIP_IN_TIERS.includes(value) ? value : null;
};

/** A gift product's tier in pence, or null when it isn't one. */
export const giftTierOf = (product: string): number | null => {
  const match = /^kf\.gift\.(\d{3,5})$/.exec(product);
  return match?.[1] === undefined ? null : Number(match[1]);
};

/** Every gift tier the catalogue uses. */
export const GIFT_TIERS: readonly number[] = [
  ...new Set(ITEMS.flatMap((i) => (i.tier === null ? [] : [i.tier]))),
].sort((a, b) => a - b);

const byItem = new Map(ITEMS.map((i) => [i.item, i]));

export const catalogItem = (item: string): CatalogItem | null => byItem.get(item) ?? null;

/** The item a `kf.item.<item>` product buys, or null. */
export const itemOfProduct = (product: string): CatalogItem | null =>
  product.startsWith('kf.item.') ? catalogItem(product.slice('kf.item.'.length)) : null;

/** The product that buys an item for yourself; null for patron-only items. */
export const productOf = (item: CatalogItem): StoreProductId | null =>
  item.tier === null ? null : itemProduct(item.item);

/** The wardrobe: what patrons may try on and keep. Sticker packs and themes aren't in it. */
export const isWardrobe = (item: CatalogItem): boolean =>
  item.kind !== 'sticker_pack' && item.kind !== 'theme';

/** The first matching set an item belongs to. */
export const setOf = (item: ArtId): ArtId | null =>
  SETS.find((s) => s.items.includes(item))?.set ?? null;
