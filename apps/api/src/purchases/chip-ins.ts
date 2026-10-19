import {
  type ChipIn,
  type ChipInPledgeRequest,
  type ChipInStartRequest,
  type FarmId,
  type PersonId,
} from '@kithfield/contracts';
import { addDays, isBirthday, localDay, startOfDay } from '@kithfield/farm';

import { eitherBlocked } from '../auth';
import type { Bindings } from '../env';
import { roleOf } from '../farm/d1';
import { farmStub } from '../farm/http';
import { catalogItem, chipInValue, THEME_VALUE, THEMES, WRAPS } from './catalog';
import {
  advance,
  COUNTED,
  creditShare,
  type Pledge,
  pledgesOf,
  type Row,
  rowOf,
  sum,
  whatOf,
} from './chip-in-settle';
import { farmOwnsTheme } from './gift-claims';
import { owns, type Refusal } from './gifts';
import { useTransaction } from './transactions';

/*
 * Chip-ins: friends together cover a wished-for gift on a member's birthday, or a farm theme.
 * Members see who chipped in and how full it is, never amounts; the friend a gift is for never
 * sees it. A pledge is a promise; nobody is charged until promises cover it, then each pays their
 * own share (the app asks for the chip-in's state right before opening the store's sheet). How it
 * moves on is in `chip-in-settle.ts`.
 */

const refuse = (status: Refusal['status'], code: Refusal['code'], fields?: string[]): Refusal => ({
  status,
  code,
  ...(fields === undefined ? {} : { fields }),
});

/**
 * How full a chip-in shows. Until two people have pledged it is rounded down to an eighth (never
 * empty once someone has), so nobody can read the one pledger's amount off the bar.
 */
export const fillOf = (row: Pick<Row, 'target'>, pledges: readonly Pledge[]): number => {
  const counted = pledges.filter((p) => COUNTED.includes(p.state));
  const raw = Math.min(1, row.target === 0 ? 1 : sum(counted, COUNTED) / row.target);
  if (counted.length >= 2 || raw === 0 || raw === 1) return raw;
  return Math.max(1, Math.floor(raw * 8)) / 8;
};

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
    filled: fillOf(row, pledges),
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

/** Every chip-in on a farm that is due to move on (closing, or finishing), moved on. */
export const advanceFarm = async (env: Bindings, farm: FarmId, now: number) => {
  const { results } = await env.DB.prepare(
    `SELECT id FROM chip_ins WHERE farm_id = ? AND state <> 'closed'
       AND (completed_at IS NULL OR delivered_at IS NULL)`,
  )
    .bind(farm)
    .all<{ id: string }>();
  for (const { id } of results) await advance(env, id, now);
};

/** The daily sweep: chip-ins past their close, and farm writes still owed, everywhere. */
export const closeDueChipIns = async (env: Bindings, now: number) => {
  const { results } = await env.DB.prepare(
    `SELECT id FROM chip_ins WHERE state <> 'closed'
       AND ((completed_at IS NULL AND closes_at IS NOT NULL AND closes_at <= ?)
         OR (completed_at IS NOT NULL AND delivered_at IS NULL)) LIMIT 500`,
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

/** Records a valid payment toward a chip-in. False when this transaction was recorded already. */
const recordPayment = async (
  db: D1Database,
  p: { chipIn: string; person: string; transaction: string; tier: string; value: number },
  now: number,
) =>
  (
    await db
      .prepare(
        `INSERT OR IGNORE INTO chip_in_payments (transaction_id, chip_in_id, person_id, tier, value, at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(p.transaction, p.chipIn, p.person, p.tier, p.value, now)
      .run()
  ).meta.changes > 0;

/**
 * Pays the person's share, if the chip-in can still use it: in one statement, so a chip-in that
 * completes or closes meanwhile never takes a share it no longer needs. False when it can't.
 */
const payShare = async (
  db: D1Database,
  p: { chipIn: string; person: string; transaction: string; tier: string; value: number },
  now: number,
) =>
  (
    await db
      .prepare(
        `INSERT INTO pledges (chip_in_id, person_id, tier, value, state, transaction_id, at)
         SELECT ?1, ?2, ?3, ?4, 'paid', ?5, ?6
         WHERE EXISTS (SELECT 1 FROM chip_ins WHERE id = ?1 AND state <> 'closed' AND completed_at IS NULL)
         ON CONFLICT (chip_in_id, person_id) DO UPDATE SET tier = excluded.tier,
           value = excluded.value, state = 'paid', transaction_id = excluded.transaction_id
         WHERE pledges.state IN ('promised', 'released')`,
      )
      .bind(p.chipIn, p.person, p.tier, p.value, p.transaction, now)
      .run()
  ).meta.changes > 0;

/**
 * `POST /v1/chip-ins/:id/pledges`. Without a transaction, a promise. With one, a payment, which is
 * never dropped: once checked against the store it is recorded, and pays the person's share if the
 * chip-in can still use it, else becomes their credit (`creditShare`).
 */
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
  const row = await advance(env, id, now);
  if (row === null) return refuse(404, 'not_found');

  if (req.transaction === null) {
    if (row.state === 'closed') return refuse(409, 'conflict');
    if (row.completed_at === null) {
      await db
        .prepare(
          `INSERT INTO pledges (chip_in_id, person_id, tier, value, state, at) VALUES (?, ?, ?, ?, 'promised', ?)
           ON CONFLICT (chip_in_id, person_id) DO UPDATE SET tier = excluded.tier,
             value = excluded.value, state = 'promised'
           WHERE pledges.state IN ('promised', 'released')`,
        )
        .bind(id, person, req.tier, value, now)
        .run();
    }
  } else {
    const check = await useTransaction(
      env,
      person,
      req.transaction,
      req.tier,
      `pledge:${id}:${person}`,
      now,
    );
    // Already paying for something else: this isn't a payment toward this chip-in.
    if (check === 'used') return refuse(409, 'conflict', ['transaction']);
    // Not seen by the store yet: answered as it stands; the phone pledges again with it.
    if (check === 'ok') {
      const payment = { chipIn: id, person, transaction: req.transaction, tier: req.tier, value };
      if (await recordPayment(db, payment, now)) {
        if (!(await payShare(db, payment, now))) {
          const latest = (await rowOf(db, id)) ?? row;
          await creditShare(db, latest, { person, transaction: req.transaction, value }, now);
        }
      }
    }
  }
  const after = (await advance(env, id, now)) ?? row;
  return viewOf(after, await pledgesOf(db, id), person);
};
