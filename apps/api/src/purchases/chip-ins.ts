import {
  type ChipIn,
  ChipInFor,
  type ChipInPledgeRequest,
  type ChipInStartRequest,
  type FarmId,
  type PersonId,
  type PledgeState,
} from '@kithfield/contracts';
import { addDays, isBirthday, localDay, startOfDay } from '@kithfield/farm';

import { eitherBlocked } from '../auth';
import type { Bindings } from '../env';
import { roleOf } from '../farm/d1';
import { farmStub } from '../farm/http';
import { opIdFrom } from '../farm/profile-fanout';
import { catalogItem, chipInValue, THEME_VALUE, THEMES, WRAPS } from './catalog';
import { CHIP_IN_PAYMENT, THEME_PAY_WINDOW_MS } from './config';
import { farmOwnsTheme } from './gift-claims';
import { owns, type Refusal } from './gifts';
import { useTransaction } from './transactions';

/*
 * Chip-ins: friends together cover a wished-for gift on a member's birthday, or a farm theme.
 * Members see who chipped in and how full it is, never amounts; the friend a gift is for never
 * sees it. By default a pledge is a promise, paid once the promises cover it (`config.ts`).
 */

type Row = {
  id: string;
  farm_id: string;
  by_id: string;
  kind: 'gift' | 'theme';
  what_json: string;
  target: number;
  state: ChipIn['state'];
  closes_at: number | null;
  created_at: number;
  covered_at: number | null;
  completed_at: number | null;
};

type Pledge = {
  person_id: string;
  tier: string;
  value: number;
  state: PledgeState;
  at: number;
};

const refuse = (status: Refusal['status'], code: Refusal['code'], fields?: string[]): Refusal => ({
  status,
  code,
  ...(fields === undefined ? {} : { fields }),
});

const rowOf = (db: D1Database, id: string) =>
  db.prepare('SELECT * FROM chip_ins WHERE id = ?').bind(id).first<Row>();

const pledgesOf = async (db: D1Database, id: string) =>
  (
    await db
      .prepare(
        'SELECT person_id, tier, value, state, at FROM pledges WHERE chip_in_id = ? ORDER BY at, person_id',
      )
      .bind(id)
      .all<Pledge>()
  ).results;

const whatOf = (row: Row): ChipInFor => ChipInFor.parse(JSON.parse(row.what_json));

const sum = (pledges: readonly Pledge[], states: readonly PledgeState[]) =>
  pledges.filter((p) => states.includes(p.state)).reduce((n, p) => n + p.value, 0);

const counted = (): readonly PledgeState[] =>
  CHIP_IN_PAYMENT === 'promise_until_covered' ? ['promised', 'paid'] : ['paid'];

/** A chip-in as `asker` sees it: who chipped in and how full, never how much. */
export const viewOf = (row: Row, pledges: readonly Pledge[], asker: PersonId): ChipIn => {
  const mine = pledges.find((p) => p.person_id === asker);
  return {
    chipIn: row.id,
    farm: row.farm_id,
    by: row.by_id,
    what: whatOf(row),
    state: row.state,
    closesAt: row.closes_at,
    filled: Math.min(1, row.target === 0 ? 1 : sum(pledges, counted()) / row.target),
    people: pledges.map((p) => p.person_id),
    mine: mine === undefined ? null : { tier: mine.tier, state: mine.state },
  };
};

/** Whether `asker` may see this chip-in: a member, and not the friend a gift is for. */
const visibleTo = async (db: D1Database, row: Row, asker: PersonId) => {
  if ((await roleOf(db, row.farm_id, asker)) === null) return false;
  const what = whatOf(row);
  return !(what.for === 'gift' && what.to === asker);
};

const opIdFor = (row: Row, what: string) => opIdFrom(row.created_at, `chip-in:${row.id}:${what}`);

/**
 * Covered and paid: the farm writes the gift on the starter's behalf, or switches the theme on.
 * Safe to repeat: the writes are once per op id and the rows are written once.
 */
const complete = async (env: Bindings, row: Row, pledges: readonly Pledge[], now: number) => {
  const db = env.DB;
  const what = whatOf(row);
  const stub = farmStub(env, row.farm_id);
  if (what.for === 'gift') {
    const gift = `chipin-${row.id}`;
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO gifts (id, from_id, to_id, farm_id, item, wrap, product, state,
             chip_in_id, created_at, paid_at, given_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 'given', ?7, ?8, ?8, ?8)`,
        )
        .bind(gift, row.by_id, what.to, row.farm_id, what.item, what.wrap, row.id, now),
      db
        .prepare(
          `INSERT OR IGNORE INTO owned_items (person_id, item, via, from_id, at) VALUES (?, ?, 'chip_in', ?, ?)`,
        )
        .bind(what.to, what.item, row.by_id, now),
    ]);
    const others = pledges
      .filter((p) => p.state === 'paid' && p.person_id !== row.by_id)
      .map((p) => p.person_id);
    const result = await stub.chipInGift(await opIdFor(row, 'gift'), row.by_id, {
      action: 'given',
      gift,
      to: what.to,
      item: what.item,
      wrap: what.wrap,
      ...(what.note === undefined ? {} : { note: what.note }),
      chipIn: row.id,
      ...(others.length > 0 ? { with: others } : {}),
    });
    if (result.result === 'rejected') {
      console.error('chip-in gift refused by the farm', { reason: result.reason });
    }
  } else {
    await db
      .prepare(
        'INSERT OR IGNORE INTO farm_themes (farm_id, theme, chip_in_id, at) VALUES (?, ?, ?, ?)',
      )
      .bind(row.farm_id, what.theme, row.id, now)
      .run();
    // A farm on rules older than farm-written themes refuses; the theme stays owned and a keeper
    // can switch it on.
    const result = await stub.chipInTheme(await opIdFor(row, 'theme'), what.theme);
    if (result.result === 'rejected') {
      console.warn('chip-in theme left for a keeper to switch on', { reason: result.reason });
    }
  }
  await db.batch([
    db
      .prepare(
        `UPDATE chip_ins SET completed_at = ?, state = 'covered', covered_at = coalesce(covered_at, ?)
         WHERE id = ? AND completed_at IS NULL`,
      )
      .bind(now, now, row.id),
    db
      .prepare(`UPDATE pledges SET state = 'released' WHERE chip_in_id = ? AND state = 'promised'`)
      .bind(row.id),
  ]);
};

/**
 * Moves a chip-in on as far as its pledges and the clock take it: covered, completed, or closed.
 * Answers the row as it is afterwards.
 */
const advance = async (env: Bindings, id: string, now: number): Promise<Row | null> => {
  const db = env.DB;
  let row = await rowOf(db, id);
  if (row === null || row.state === 'closed' || row.completed_at !== null) return row;
  const pledges = await pledgesOf(db, id);
  const paid = sum(pledges, ['paid']);
  if (paid >= row.target) {
    await complete(env, row, pledges, now);
    return rowOf(db, id);
  }
  if (row.closes_at !== null && row.closes_at <= now) {
    // Closed uncovered: nothing promised is charged; anything paid is owed back.
    await db.batch([
      db
        .prepare(`UPDATE chip_ins SET state = 'closed' WHERE id = ? AND state <> 'closed'`)
        .bind(id),
      db
        .prepare(
          `UPDATE pledges SET state = 'released' WHERE chip_in_id = ? AND state = 'promised'`,
        )
        .bind(id),
      db
        .prepare(
          `UPDATE pledges SET state = 'refunded', refund_owed = 1 WHERE chip_in_id = ? AND state = 'paid'`,
        )
        .bind(id),
    ]);
    return rowOf(db, id);
  }
  if (row.state === 'open' && sum(pledges, counted()) >= row.target) {
    const closesAt =
      row.kind === 'theme' && row.closes_at === null ? now + THEME_PAY_WINDOW_MS : row.closes_at;
    await db
      .prepare(
        `UPDATE chip_ins SET state = 'covered', covered_at = ?, closes_at = ? WHERE id = ? AND state = 'open'`,
      )
      .bind(now, closesAt, id)
      .run();
    row = await rowOf(db, id);
  }
  return row;
};

/** Every chip-in on a farm that is due to move on (closing, or finishing), moved on. */
export const advanceFarm = async (env: Bindings, farm: FarmId, now: number) => {
  const { results } = await env.DB.prepare(
    `SELECT id FROM chip_ins WHERE farm_id = ? AND state <> 'closed' AND completed_at IS NULL`,
  )
    .bind(farm)
    .all<{ id: string }>();
  for (const { id } of results) await advance(env, id, now);
};

/** The daily sweep: chip-ins past their close, everywhere. */
export const closeDueChipIns = async (env: Bindings, now: number) => {
  const { results } = await env.DB.prepare(
    `SELECT id FROM chip_ins WHERE state <> 'closed' AND completed_at IS NULL
       AND closes_at IS NOT NULL AND closes_at <= ? LIMIT 500`,
  )
    .bind(now)
    .all<{ id: string }>();
  for (const { id } of results) {
    await advance(env, id, now).catch((error: unknown) =>
      console.error('chip-in close failed', {
        error: error instanceof Error ? error.message : 'unknown',
      }),
    );
  }
};

/** `POST /v1/farms/:id/chip-ins`, by a member. */
export const startChipIn = async (
  env: Bindings,
  person: PersonId,
  farm: FarmId,
  req: ChipInStartRequest,
  now: number,
): Promise<ChipIn | Refusal> => {
  const db = env.DB;
  let key: string;
  let target: number;
  let closesAt: number | null = null;
  if (req.for === 'gift') {
    if (req.to === person) return refuse(400, 'bad_request', ['to']);
    const item = catalogItem(req.item);
    if (item === null || item.tier === null) return refuse(400, 'bad_request', ['item']);
    if (!WRAPS.includes(req.wrap)) return refuse(400, 'bad_request', ['wrap']);
    const state = await farmStub(env, farm).state();
    const friend = state?.members.find((m) => m.person === req.to);
    if (state === null || state === undefined || friend === undefined)
      return refuse(404, 'not_found');
    const today = localDay(now, state.timeZone);
    if (friend.birthday === null || !isBirthday(friend.birthday, today)) {
      return refuse(409, 'conflict', ['to']);
    }
    if (await eitherBlocked(db, person, req.to)) return refuse(403, 'unavailable');
    if (await owns(db, req.to, item.item)) return refuse(409, 'conflict', ['item']);
    key = `gift:${req.to}:${item.item}`;
    target = item.tier;
    closesAt = startOfDay(addDays(today, 1), state.timeZone);
  } else {
    if (!THEMES.includes(req.theme)) return refuse(400, 'bad_request', ['theme']);
    if (await farmOwnsTheme(db, farm, req.theme)) return refuse(409, 'conflict', ['theme']);
    key = `theme:${req.theme}`;
    target = THEME_VALUE;
  }
  await advanceFarm(env, farm, now);
  const existing = await db
    .prepare(
      `SELECT id FROM chip_ins WHERE farm_id = ? AND target_key = ? AND state <> 'closed'
         AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(farm, key)
    .first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  if (existing === null) {
    await db
      .prepare(
        `INSERT INTO chip_ins (id, farm_id, by_id, kind, target_key, what_json, target, state, closes_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      )
      .bind(id, farm, person, req.for, key, JSON.stringify(req), target, closesAt, now)
      .run();
  }
  const row = await rowOf(db, id);
  if (row === null) return refuse(404, 'not_found');
  return viewOf(row, await pledgesOf(db, id), person);
};

/** `GET /v1/farms/:id/chip-ins`: open and covered ones the asker may see, newest first. */
export const farmChipIns = async (
  env: Bindings,
  person: PersonId,
  farm: FarmId,
  now: number,
): Promise<ChipIn[]> => {
  await advanceFarm(env, farm, now);
  const { results } = await env.DB.prepare(
    `SELECT * FROM chip_ins WHERE farm_id = ? AND state <> 'closed'
       AND (completed_at IS NULL OR completed_at > ?) ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(farm, now - 86_400_000)
    .all<Row>();
  const out: ChipIn[] = [];
  for (const row of results) {
    if (!(await visibleTo(env.DB, row, person))) continue;
    out.push(viewOf(row, await pledgesOf(env.DB, row.id), person));
  }
  return out;
};

/** `POST /v1/chip-ins/:id/pledges`. */
export const pledge = async (
  env: Bindings,
  person: PersonId,
  id: string,
  req: ChipInPledgeRequest,
  now: number,
): Promise<ChipIn | Refusal> => {
  const db = env.DB;
  const before = await rowOf(db, id);
  if (before === null || !(await visibleTo(db, before, person))) return refuse(404, 'not_found');
  const value = chipInValue(req.tier);
  if (value === null) return refuse(400, 'bad_request', ['tier']);
  if (CHIP_IN_PAYMENT === 'pay_upfront' && req.transaction === null) {
    return refuse(400, 'bad_request', ['transaction']);
  }
  const row = await advance(env, id, now);
  if (row === null || row.state === 'closed') return refuse(409, 'conflict');
  const mine = (await pledgesOf(db, id)).find((p) => p.person_id === person);
  if (mine?.state === 'paid' || row.completed_at !== null) {
    return viewOf(row, await pledgesOf(db, id), person);
  }
  if (req.transaction === null) {
    await db
      .prepare(
        `INSERT INTO pledges (chip_in_id, person_id, tier, value, state, at) VALUES (?, ?, ?, ?, 'promised', ?)
         ON CONFLICT (chip_in_id, person_id) DO UPDATE SET tier = excluded.tier, value = excluded.value
         WHERE pledges.state = 'promised'`,
      )
      .bind(id, person, req.tier, value, now)
      .run();
  } else {
    const check = await useTransaction(
      env,
      person,
      req.transaction,
      req.tier,
      `pledge:${id}:${person}`,
      now,
    );
    if (check === 'used') return refuse(409, 'conflict', ['transaction']);
    if (check === 'ok') {
      await db
        .prepare(
          `INSERT INTO pledges (chip_in_id, person_id, tier, value, state, transaction_id, at)
           VALUES (?, ?, ?, ?, 'paid', ?, ?)
           ON CONFLICT (chip_in_id, person_id) DO UPDATE SET tier = excluded.tier,
             value = excluded.value, state = 'paid', transaction_id = excluded.transaction_id
           WHERE pledges.state = 'promised'`,
        )
        .bind(id, person, req.tier, value, req.transaction, now)
        .run();
    }
    // Not seen by the store yet: answered as it stands; the phone pledges again with it.
  }
  const after = (await advance(env, id, now)) ?? row;
  return viewOf(after, await pledgesOf(db, id), person);
};
