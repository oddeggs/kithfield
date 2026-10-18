import type { ArtId, Season } from '@kithfield/contracts';

/*
 * The shop's switches. Each founder decision still pending is one constant here, set to the safe
 * default the docs name, and listed in `docs/products.md` ("Decisions pending").
 */

/**
 * When chip-in pledges are charged. `promise_until_covered` (the docs' default): a pledge is a
 * promise, nobody pays until the promises cover the gift or theme, then each pays their share.
 * `pay_upfront`: every pledge comes with its store transaction. In-app purchases can't be
 * refunded by the app, which is why promises are the default until App Review says otherwise.
 */
export const CHIP_IN_PAYMENT: 'promise_until_covered' | 'pay_upfront' = 'promise_until_covered';

/** Once promises cover a theme, how long everyone has to pay their share before it closes. */
export const THEME_PAY_WINDOW_MS = 3 * 86_400_000;

/**
 * What Farm Plus covers. `one_farm`: the payer picks one farm (`PUT /v1/me/farm-plus`) and its
 * first `FARM_PLUS_COVERS` members by joining time get the perks, the payer always among them.
 * The design's "up to 8 critters" on a farm of up to 24 is a founder decision still pending.
 */
export const FARM_PLUS_MODE = 'one_farm' as const;
export const FARM_PLUS_COVERS = 8;

/** Founding Farmer is sold until the launch season ends (20 March 2027, 00:00 UTC), then retired. */
export const FOUNDING_ON_SALE_UNTIL = Date.UTC(2027, 2, 20);

/** The monthly parcel: the wardrobe item each calendar month (UTC) brings a patron. */
export const PARCELS: Readonly<Record<number, ArtId>> = {
  1: 'aurora',
  2: 'lights',
  3: 'blossom',
  4: 'umbrella',
  5: 'butterfly',
  6: 'pinwheel',
  7: 'bee',
  8: 'golden',
  9: 'teacup',
  10: 'chime',
  11: 'ember',
  12: 'frost',
};

/** The vote on the next critter, by season (`<season>-<year>`, the year the season starts). */
export const VOTES: Readonly<Record<string, readonly ArtId[]>> = {
  'autumn-2026': ['hare', 'heron', 'hedgepig'],
  'winter-2026': ['hare', 'heron', 'hedgepig'],
  'spring-2027': ['badger', 'otter', 'wren'],
};

export const voteKey = (season: Season, year: number) => `${season}-${year}`;

/** The printed scrapbook. */
export const BOOK = {
  cloths: ['moss', 'rose', 'ink', 'mustard'] as const satisfies readonly ArtId[],
  sizeCm: 21,
  minPages: 24,
  /** Pence for the smallest book, and for each page beyond it. */
  base: 2400,
  perPage: 25,
  currency: 'GBP',
};
