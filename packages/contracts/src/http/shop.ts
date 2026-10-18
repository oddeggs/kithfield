import { z } from 'zod';

import { ProductId } from '../payloads/care';
import { SeasonRef } from '../payloads/farm';
import { ArtId, EpochMs, FarmId, LocalDate, Money, PersonId, text } from '../primitives';

/*
 * Rocco's cart, the collection, wishlists, farm themes and patrons. Purchases go through RevenueCat
 * (StoreKit 2 and Play Billing); its webhook (`RevenueCatWebhook`) is how the server learns of
 * them. App Store and Play prices are never sent by the server: the app shows the store's own
 * display price. Care is always free: nothing here grows, waters or wakes anything.
 */

/**
 * A store product id, the same in App Store Connect, Play and RevenueCat. Items are
 * `kf.item.<item>` (non-consumable); gifts and chip-ins are consumables by price tier
 * (`kf.gift.<tier>`, `kf.chipin.<tier>`); patronage is `PATRON_PRODUCTS`.
 */
export const StoreProductId = ProductId;
export type StoreProductId = z.infer<typeof StoreProductId>;

/** The store product that buys a shop item for yourself. */
export const itemProduct = (item: ArtId): StoreProductId => `kf.item.${item}`;

/** Patronage, as products. Founding Farmer is sold in the launch season only, then retired. */
export const PATRON_PRODUCTS = {
  patronMonthly: 'kf.patron.monthly',
  patronYearly: 'kf.patron.yearly',
  farmPlusMonthly: 'kf.farmplus.monthly',
  founding: 'kf.founding',
} as const satisfies Record<string, StoreProductId>;

/** RevenueCat entitlements: any patronage grants `patron`; the Farm Plus payer also `farm_plus`. */
export const ENTITLEMENT_IDS = { patron: 'patron', farmPlus: 'farm_plus' } as const;

/** A store's id for one transaction: Apple's transaction id, Google's order id. */
export const StoreTransactionId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export type StoreTransactionId = z.infer<typeof StoreTransactionId>;

export const Store = z.enum(['app_store', 'play_store', 'stripe', 'promotional']);
export type Store = z.infer<typeof Store>;

export const ShopItemKind = z.enum([
  'cottage',
  'companion',
  'coat',
  'little_thing',
  'sticker_pack',
  'theme',
]);
export type ShopItemKind = z.infer<typeof ShopItemKind>;

/** The part of a critter an item dresses (the `Critter` key it fills). */
export const CritterSlot = z.enum(['cottage', 'companion', 'coat', 'outfit', 'accessory']);
export type CritterSlot = z.infer<typeof CritterSlot>;

/**
 * One thing the shop sells, by its art id. Every item comes back round: `lastOnCart` and `back`
 * say when it was here and the season it returns, never a countdown.
 */
export const ShopItem = z.object({
  item: ArtId,
  kind: ShopItemKind,
  /** The critter part it dresses; null for sticker packs and farm themes. */
  slot: CritterSlot.nullable(),
  /** Buys it for yourself; null for patron-only items and for themes, which friends chip in for. */
  product: StoreProductId.nullable(),
  /** Buys it as a gift (a consumable at its price tier); null when it can't be given. */
  giftProduct: StoreProductId.nullable(),
  /** Patrons keep it with `POST /v1/shop/items/:item/keep`. */
  patrons: z.boolean(),
  /** The matching set it belongs to. */
  set: ArtId.nullable(),
  lastOnCart: LocalDate.nullable(),
  back: SeasonRef.nullable(),
});
export type ShopItem = z.infer<typeof ShopItem>;

/** A matching set: a fixed list; finishing it unlocks a sticker and a pose. */
export const ShopSet = z.object({
  set: ArtId,
  items: z.array(ArtId).min(2).max(8),
  reward: z.object({ sticker: ArtId, pose: ArtId }),
});
export type ShopSet = z.infer<typeof ShopSet>;

/** `GET /v1/shop/catalog`: everything the shop has ever sold, its sets, and the free wrappings. */
export const ShopCatalog = z.object({
  items: z.array(ShopItem).max(500),
  sets: z.array(ShopSet).max(50),
  wraps: z.array(ArtId).min(1).max(10),
});
export type ShopCatalog = z.infer<typeof ShopCatalog>;

/**
 * `GET /v1/shop/cart`: this week's rotation of 8 to 12 items. `name` is the week's title, drawn
 * from the catalogue of copy (`cart.<name>`).
 */
export const ShopCart = z.object({
  week: LocalDate,
  name: ArtId,
  items: z.array(ArtId).min(1).max(12),
});
export type ShopCart = z.infer<typeof ShopCart>;

/** How an item came to be yours. Kept items stay yours, patron or not. */
export const OwnedVia = z.enum(['bought', 'gift', 'chip_in', 'patron', 'parcel', 'founding']);
export type OwnedVia = z.infer<typeof OwnedVia>;

/**
 * `GET /v1/me/collection`: everything the person owns and where it came from (`from` is the giver
 * of a gift), and the set rewards they unlocked.
 */
export const Collection = z.object({
  items: z
    .array(z.object({ item: ArtId, via: OwnedVia, from: PersonId.nullable(), at: EpochMs }))
    .max(1000),
  rewards: z.array(z.object({ set: ArtId, sticker: ArtId, pose: ArtId })).max(50),
});
export type Collection = z.infer<typeof Collection>;

/**
 * A person's patronage. `via: farm_plus` is a member covered by someone else's Farm Plus (no
 * period, store or renewal of their own). `ending` is cancelled with perks on until `until`;
 * `grace` is a billing problem the store is retrying; `lapsed` keeps owned items and the wall
 * name while the perks rest.
 */
export const Patronage = z.object({
  tier: z.enum(['patron', 'farm_plus', 'founding']),
  via: z.enum(['own', 'farm_plus']),
  period: z.enum(['month', 'year', 'lifetime']).nullable(),
  state: z.enum(['active', 'ending', 'grace', 'lapsed']),
  since: EpochMs,
  /** When it renews (`active`, `grace`) or perks end (`ending`); null for lifetime and lapsed. */
  until: EpochMs.nullable(),
  store: Store.nullable(),
});
export type Patronage = z.infer<typeof Patronage>;

/**
 * `GET /v1/me/entitlements`, and the answer to `POST /v1/purchases/sync` (no body), which the app
 * calls after a purchase or a restore so the server asks RevenueCat at once rather than waiting
 * for its webhook. Friends never see any of it.
 */
export const Entitlements = z.object({
  /** Patron perks are on: the whole wardrobe, captions, parcels, votes and betas. */
  perks: z.boolean(),
  patronage: Patronage.nullable(),
  /** The payer's Farm Plus: the farm it covers once chosen, and who it covers there. */
  farmPlus: z.object({ farm: FarmId.nullable(), covered: z.array(PersonId).max(8) }).nullable(),
  owned: z.array(ArtId).max(1000),
});
export type Entitlements = z.infer<typeof Entitlements>;

/** `PUT /v1/me/farm-plus`: the farm the payer's Farm Plus covers. 204. */
export const FarmPlusChoice = z.object({ farm: FarmId });
export type FarmPlusChoice = z.infer<typeof FarmPlusChoice>;

/** `GET /v1/patrons/offer`: the patronage products on sale now. */
export const PatronOffer = z.object({
  products: z.array(StoreProductId).min(1).max(8),
  /** Founding Farmer is offered (the launch season only); no countdown is ever shown. */
  founding: z.boolean(),
});
export type PatronOffer = z.infer<typeof PatronOffer>;

const WallName = text(32);

/**
 * `GET /v1/patrons/wall?after=`: the farmers' wall, names in order, a page at a time, and how many
 * other names there are. A name stays after patronage lapses.
 */
export const FarmersWall = z.object({
  names: z.array(WallName).max(200),
  others: z.int().min(0),
  /** Pass as `after` for the next page; null on the last. */
  next: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .nullable(),
});
export type FarmersWall = z.infer<typeof FarmersWall>;

/** `PUT /v1/me/wall`: the name a patron shows on the wall, or null to take it down. 204. */
export const WallNameRequest = z.object({ name: WallName.nullable() });
export type WallNameRequest = z.infer<typeof WallNameRequest>;

/**
 * `GET /v1/patrons/vote`: this season's vote on the next critter, patrons only. No tallies: the
 * winner is announced when it moves in.
 */
export const CritterVote = z.object({
  season: SeasonRef,
  options: z.array(ArtId).min(2).max(5),
  mine: ArtId.nullable(),
});
export type CritterVote = z.infer<typeof CritterVote>;

/** `PUT /v1/patrons/vote`: once a season; voting again changes it. 204. */
export const CritterVoteRequest = z.object({ option: ArtId });
export type CritterVoteRequest = z.infer<typeof CritterVoteRequest>;

/**
 * A wishlist. `GET /v1/me/wishlist` is the person's own; `PUT` and `DELETE /v1/me/wishlist/:item`
 * add and remove (204). Friends read it on the person's critter card with
 * `GET /v1/farms/:id/members/:person/wishlist`, members of a shared farm only; nobody is told
 * when someone looks.
 */
export const Wishlist = z.object({
  items: z.array(z.object({ item: ArtId, at: EpochMs })).max(30),
});
export type Wishlist = z.infer<typeof Wishlist>;

/**
 * `GET /v1/farms/:id/themes`: the farm themes this farm owns (each covered once, kept forever) and
 * the one on show. A keeper switches with `settings_changed {theme}`.
 */
export const FarmThemes = z.object({
  owned: z.array(ArtId).max(50),
  current: ArtId.nullable(),
});
export type FarmThemes = z.infer<typeof FarmThemes>;

/**
 * `GET /v1/costs?month=YYYY-MM` (public): the open books page, from the month's accounts. Lines are
 * named by key and drawn from the catalogue of copy.
 */
export const CostsReport = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  spent: z.array(z.object({ line: ArtId, amount: Money })).max(20),
  income: z.array(z.object({ line: ArtId, amount: Money })).max(20),
  setAside: Money,
});
export type CostsReport = z.infer<typeof CostsReport>;
