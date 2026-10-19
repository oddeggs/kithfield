import type { ArtId, Season } from '@kithfield/contracts';

/*
 * The shop's switches. Each founder decision still pending is one constant here, set to the safe
 * default the docs name, and listed in `docs/products.md` ("Decisions pending").
 */

/**
 * What a patron keeps from the wardrobe. `false` (decided, `docs/products.md` §6): items kept as a
 * patron rest with the perks when patronage lapses, and come back with them; bought items, gifts and
 * parcels always stay. `true` would make kept items theirs for good, patron or not.
 */
export const PATRON_KEEP_ALL = false;

/**
 * How long past its period a subscription in billing grace keeps its perks when no news of its
 * end arrives (the App Store retries a failed renewal for up to 16 days).
 */
export const GRACE_SLACK_MS = 16 * 86_400_000;

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
