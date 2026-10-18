import {
  type ArtId,
  type Entitlements,
  type FarmId,
  PATRON_PRODUCTS,
  type Patronage,
  type PersonId,
  type Store,
} from '@kithfield/contracts';

import { FARM_PLUS_COVERS, PARCELS, PATRON_KEEP_ALL } from './config';
import { patronProduct } from './products';

/*
 * What a person's patronage gives them now, read from D1. Perks rest when patronage lapses; what
 * they own stays. Farm Plus covers the payer's chosen farm (see `config.ts`).
 */

export type SubState = Patronage['state'];

export interface SubRow {
  readonly product: string;
  readonly state: SubState;
  readonly since: number;
  readonly until: number | null;
  readonly store: string | null;
}

/** An `active` row renewing late is given a day before it counts as lapsed. */
const RENEWAL_SLACK_MS = 86_400_000;

/**
 * The state a row is in now. RevenueCat tells us of an expiry, but if that news is late a row
 * whose time is over still counts as lapsed.
 */
export const stateNow = (row: SubRow, now: number): SubState => {
  if (row.until === null || row.state === 'lapsed' || row.state === 'grace') return row.state;
  if (row.state === 'ending' && row.until <= now) return 'lapsed';
  if (row.state === 'active' && row.until + RENEWAL_SLACK_MS <= now) return 'lapsed';
  return row.state;
};

const TIER_RANK = { founding: 3, farm_plus: 2, patron: 1 } as const;
const STATE_RANK = { active: 4, ending: 3, grace: 2, lapsed: 1 } as const;

export const hasPerks = (state: SubState) => state !== 'lapsed';

/** A row as the contract's `Patronage`, or null for a product that isn't patronage. */
export const patronageOf = (row: SubRow, now: number): Patronage | null => {
  const what = patronProduct(row.product);
  if (what === null) return null;
  // Founding Farmer never runs out with time; it follows its row, which only an Apple refund lapses.
  const state = what.tier === 'founding' ? row.state : stateNow(row, now);
  return {
    tier: what.tier,
    via: 'own',
    period: what.period,
    state,
    since: row.since,
    until: state === 'lapsed' || what.period === 'lifetime' ? null : row.until,
    store: (row.store as Store | null) ?? null,
  };
};

/** The person's best own patronage: perks first, then the higher tier, then the latest. */
export const bestOwn = (rows: readonly SubRow[], now: number): Patronage | null => {
  const all = rows.flatMap((r) => {
    const p = patronageOf(r, now);
    return p === null ? [] : [p];
  });
  all.sort(
    (a, b) =>
      STATE_RANK[b.state] - STATE_RANK[a.state] ||
      TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
      b.since - a.since,
  );
  return all[0] ?? null;
};

export const subscriptionRows = async (db: D1Database, person: PersonId): Promise<SubRow[]> =>
  (
    await db
      .prepare('SELECT product, state, since, until, store FROM subscriptions WHERE person_id = ?')
      .bind(person)
      .all<SubRow>()
  ).results;

/** Whether this person's own Farm Plus gives perks now. */
const farmPlusLive = (rows: readonly SubRow[], now: number) =>
  rows.some((r) => r.product === PATRON_PRODUCTS.farmPlusMonthly && hasPerks(stateNow(r, now)));

/** Who a farm's Farm Plus covers: the payer, then its longest-standing members, up to the cap. */
export const coveredOn = async (
  db: D1Database,
  farm: FarmId,
  payer: PersonId,
): Promise<PersonId[]> => {
  const { results } = await db
    .prepare(
      `SELECT person_id FROM memberships WHERE farm_id = ? AND left_at IS NULL
       ORDER BY person_id = ? DESC, joined_at, person_id LIMIT ?`,
    )
    .bind(farm, payer, FARM_PLUS_COVERS)
    .all<{ person_id: string }>();
  const people = results.map((r) => r.person_id);
  return people.includes(payer) ? people : [];
};

/** Whether someone else's live Farm Plus covers this person. */
export const coveredByFarmPlus = async (
  db: D1Database,
  person: PersonId,
  now: number,
): Promise<boolean> => {
  const { results } = await db
    .prepare(
      `SELECT fp.payer_id, fp.farm_id, s.state, s.since, s.until, s.store, s.product
       FROM farm_plus fp
       JOIN subscriptions s ON s.person_id = fp.payer_id AND s.product = ?
       JOIN memberships m ON m.farm_id = fp.farm_id AND m.person_id = ? AND m.left_at IS NULL
       WHERE fp.payer_id <> ?`,
    )
    .bind(PATRON_PRODUCTS.farmPlusMonthly, person, person)
    .all<SubRow & { payer_id: string; farm_id: string }>();
  for (const row of results) {
    if (!hasPerks(stateNow(row, now))) continue;
    if ((await coveredOn(db, row.farm_id, row.payer_id)).includes(person)) return true;
  }
  return false;
};

/** Whether patron keeps count: always, unless they rest with lapsed perks (`PATRON_KEEP_ALL`). */
export type KeepOptions = { readonly keepAll?: boolean };

export const ownedItems = async (
  db: D1Database,
  person: PersonId,
  withPatronKeeps = true,
): Promise<ArtId[]> =>
  (
    await db
      .prepare(
        `SELECT item FROM owned_items WHERE person_id = ? AND (? OR via <> 'patron') ORDER BY at, item`,
      )
      .bind(person, withPatronKeeps ? 1 : 0)
      .all<{ item: string }>()
  ).results.map((r) => r.item);

/** This month's parcel goes to a patron the first time their entitlements are read in it. */
const grantParcel = async (db: D1Database, person: PersonId, now: number) => {
  const item = PARCELS[new Date(now).getUTCMonth() + 1];
  if (item === undefined) return;
  await db
    .prepare(
      `INSERT OR IGNORE INTO owned_items (person_id, item, via, from_id, at) VALUES (?, ?, 'parcel', NULL, ?)`,
    )
    .bind(person, item, now)
    .run();
};

/** `GET /v1/me/entitlements`: perks, patronage, the payer's Farm Plus and what they own. */
export const entitlementsOf = async (
  db: D1Database,
  person: PersonId,
  now: number,
  { keepAll = PATRON_KEEP_ALL }: KeepOptions = {},
): Promise<Entitlements> => {
  const rows = await subscriptionRows(db, person);
  const own = bestOwn(rows, now);
  const ownPerks = own !== null && hasPerks(own.state);
  const covered = ownPerks ? false : await coveredByFarmPlus(db, person, now);
  const perks = ownPerks || covered;
  const patronage: Patronage | null = ownPerks
    ? own
    : covered
      ? {
          tier: 'farm_plus',
          via: 'farm_plus',
          period: null,
          state: 'active',
          since: now,
          until: null,
          store: null,
        }
      : own;
  let farmPlus: Entitlements['farmPlus'] = null;
  if (farmPlusLive(rows, now)) {
    const chosen = await db
      .prepare('SELECT farm_id FROM farm_plus WHERE payer_id = ?')
      .bind(person)
      .first<{ farm_id: string }>();
    farmPlus = {
      farm: chosen?.farm_id ?? null,
      covered: chosen === null ? [] : await coveredOn(db, chosen.farm_id, person),
    };
  }
  if (perks) await grantParcel(db, person, now);
  return { perks, patronage, farmPlus, owned: await ownedItems(db, person, keepAll || perks) };
};

/** Whether the person's perks are on now (own patronage, or covered by a friend's Farm Plus). */
export const perksOn = async (db: D1Database, person: PersonId, now: number): Promise<boolean> => {
  const own = bestOwn(await subscriptionRows(db, person), now);
  if (own !== null && hasPerks(own.state)) return true;
  return coveredByFarmPlus(db, person, now);
};

/** Whether the person ever had patronage of their own (the wall keeps their name). */
export const everPatron = async (db: D1Database, person: PersonId): Promise<boolean> =>
  (await db
    .prepare('SELECT 1 FROM subscriptions WHERE person_id = ? LIMIT 1')
    .bind(person)
    .first()) !== null;

/** The items among `items` the person doesn't own (patron keeps resting with lapsed perks). */
export const unowned = async (
  db: D1Database,
  person: PersonId,
  items: readonly string[],
  { keepAll = PATRON_KEEP_ALL }: KeepOptions = {},
): Promise<string[]> => {
  if (items.length === 0) return [];
  const withKeeps = keepAll || (await perksOn(db, person, Date.now()));
  const owned = new Set(await ownedItems(db, person, withKeeps));
  return items.filter((i) => !owned.has(i));
};
