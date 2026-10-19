import type {
  ErrorCode,
  GiftPaidRequest,
  GiftStart,
  GiftStartRequest,
  GiftView,
  PersonId,
} from '@kithfield/contracts';

import { eitherBlocked } from '../auth';
import type { Bindings } from '../env';
import { knowsSomeoneOn, roleOf } from '../farm/d1';
import { catalogItem, giftProduct, WRAPS } from './catalog';
import { useTransaction } from './transactions';

/*
 * Gifts: reserve a gift id, buy its consumable, tie the store transaction to it, then the phone
 * sends `gift {given}` with that id (the farm claims it, `gift-claims.ts`).
 */

export type Refusal = { status: 400 | 403 | 404 | 409; code: ErrorCode; fields?: string[] };

const refuse = (status: Refusal['status'], code: ErrorCode, fields?: string[]): Refusal => ({
  status,
  code,
  ...(fields === undefined ? {} : { fields }),
});

export const owns = async (db: D1Database, person: PersonId, item: string) =>
  (await db
    .prepare('SELECT 1 FROM owned_items WHERE person_id = ? AND item = ?')
    .bind(person, item)
    .first()) !== null;

/**
 * Whether `giver` may leave something for `to` on `farm`: both live there, or the giver may visit
 * it (friends of friends, not a member) and `to` lives there. Blocks are checked by the caller.
 */
const mayGiveOn = async (db: D1Database, giver: PersonId, to: PersonId, farm: string) => {
  if ((await roleOf(db, farm, to)) === null) return false;
  if ((await roleOf(db, farm, giver)) !== null) return true;
  return knowsSomeoneOn(db, giver, farm);
};

/** `POST /v1/gifts`. */
export const startGift = async (
  env: Bindings,
  giver: PersonId,
  req: GiftStartRequest,
  now: number,
): Promise<GiftStart | Refusal> => {
  const db = env.DB;
  if (req.to === giver) return refuse(400, 'bad_request', ['to']);
  const item = catalogItem(req.item);
  if (item === null || item.tier === null) return refuse(400, 'bad_request', ['item']);
  if (!WRAPS.includes(req.wrap)) return refuse(400, 'bad_request', ['wrap']);
  if (!(await mayGiveOn(db, giver, req.to, req.farm))) return refuse(404, 'not_found');
  if (await eitherBlocked(db, giver, req.to)) return refuse(403, 'unavailable');
  if (await owns(db, req.to, item.item)) return refuse(409, 'conflict');
  const product = giftProduct(item.tier);
  const waiting = await db
    .prepare(
      `SELECT id FROM gifts WHERE from_id = ? AND to_id = ? AND item = ? AND farm_id = ?
         AND state = 'unpaid' ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(giver, req.to, item.item, req.farm)
    .first<{ id: string }>();
  if (waiting !== null) {
    await db.prepare('UPDATE gifts SET wrap = ? WHERE id = ?').bind(req.wrap, waiting.id).run();
    return { gift: waiting.id, product };
  }
  const gift = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO gifts (id, from_id, to_id, farm_id, item, wrap, product, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
    )
    .bind(gift, giver, req.to, req.farm, item.item, req.wrap, product, now)
    .run();
  return { gift, product };
};

type GiftRow = {
  id: string;
  from_id: string;
  to_id: string;
  product: string | null;
  state: GiftView['state'];
  transaction_id: string | null;
};

const giftRow = (db: D1Database, gift: string) =>
  db
    .prepare('SELECT id, from_id, to_id, product, state, transaction_id FROM gifts WHERE id = ?')
    .bind(gift)
    .first<GiftRow>();

/** `POST /v1/gifts/:gift/paid`: ties the store transaction; `unpaid` until the store says so. */
export const giftPaid = async (
  env: Bindings,
  giver: PersonId,
  gift: string,
  req: GiftPaidRequest,
  now: number,
): Promise<GiftView | Refusal> => {
  const row = await giftRow(env.DB, gift);
  if (row === null || row.from_id !== giver) return refuse(404, 'not_found');
  if (row.state !== 'unpaid') {
    return row.transaction_id === req.transaction
      ? { gift, state: row.state }
      : refuse(409, 'conflict');
  }
  if (row.product === null) return refuse(409, 'conflict');
  const check = await useTransaction(env, giver, req.transaction, row.product, `gift:${gift}`, now);
  if (check === 'used') return refuse(409, 'conflict');
  if (check === 'unknown') return { gift, state: 'unpaid' };
  await env.DB.prepare(
    `UPDATE gifts SET state = 'paid', transaction_id = ?, paid_at = ? WHERE id = ? AND state = 'unpaid'`,
  )
    .bind(req.transaction, now, gift)
    .run();
  const after = await giftRow(env.DB, gift);
  return { gift, state: after?.state ?? 'paid' };
};

/** `GET /v1/gifts/:gift`: for its giver or the friend it is for. */
export const giftView = async (
  db: D1Database,
  person: PersonId,
  gift: string,
): Promise<GiftView | null> => {
  const row = await giftRow(db, gift);
  if (row === null || (row.from_id !== person && row.to_id !== person)) return null;
  // The friend it is for never sees it before it is given.
  if (row.to_id === person && (row.state === 'unpaid' || row.state === 'paid')) return null;
  return { gift, state: row.state };
};
