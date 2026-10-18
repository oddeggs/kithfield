import { ChipInFor, type ChipIn, type PledgeState } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { farmStub } from '../farm/http';
import { opIdFrom } from '../farm/profile-fanout';
import { THEME_PAY_WINDOW_MS } from './config';

/*
 * How a chip-in moves on. Nobody is charged until promises cover it; then each pledger pays their
 * own share. Once paid shares cover it, it completes exactly once: the gift is written on the
 * starter's behalf (or the theme is the farm's), and that write is owed until the farm takes it.
 * A gift chip-in whose day ends before everyone paid closes, and each paid share becomes the
 * payer's credit (`creditShare`); a theme's pay window passing only sends it back to open.
 */

export type Row = {
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
  delivered_at: number | null;
};

export type Pledge = {
  person_id: string;
  tier: string;
  value: number;
  state: PledgeState;
  at: number;
};

/** Who a starter whose account is gone shows as. */
export const GONE = 'gone';

export const rowOf = (db: D1Database, id: string) =>
  db.prepare('SELECT * FROM chip_ins WHERE id = ?').bind(id).first<Row>();

export const pledgesOf = async (db: D1Database, id: string) =>
  (
    await db
      .prepare(
        'SELECT person_id, tier, value, state, at FROM pledges WHERE chip_in_id = ? ORDER BY at, person_id',
      )
      .bind(id)
      .all<Pledge>()
  ).results;

export const whatOf = (row: Row): ChipInFor => ChipInFor.parse(JSON.parse(row.what_json));

export const sum = (pledges: readonly Pledge[], states: readonly PledgeState[]) =>
  pledges.filter((p) => states.includes(p.state)).reduce((n, p) => n + p.value, 0);

/** What fills a chip-in: promises and payments alike, so friends can see it fill before paying. */
export const COUNTED: readonly PledgeState[] = ['promised', 'paid'];

/**
 * A payment its chip-in can't use becomes the payer's: the gift item itself if they don't own it,
 * else its value as shop credit. Once per transaction.
 */
export const creditShare = async (
  db: D1Database,
  row: Row,
  payment: { person: string; transaction: string; value: number },
  now: number,
): Promise<void> => {
  const what = whatOf(row);
  const item =
    what.for === 'gift' &&
    (await db
      .prepare('SELECT 1 FROM owned_items WHERE person_id = ? AND item = ?')
      .bind(payment.person, what.item)
      .first()) === null
      ? what.item
      : null;
  const credit = db
    .prepare(
      `INSERT OR IGNORE INTO shop_credits (transaction_id, person_id, chip_in_id, value, item, at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(payment.transaction, payment.person, row.id, payment.value, item, now);
  if (item === null) {
    await credit.run();
    return;
  }
  await db.batch([
    credit,
    db
      .prepare(
        `INSERT OR IGNORE INTO owned_items (person_id, item, via, from_id, at)
         SELECT person_id, item, 'chip_in', NULL, at FROM shop_credits
         WHERE transaction_id = ? AND item IS NOT NULL`,
      )
      .bind(payment.transaction),
  ]);
};

/** Every payment toward a chip-in, credited back to its payer (once each). */
const creditAllPayments = async (db: D1Database, row: Row, now: number) => {
  const { results } = await db
    .prepare('SELECT transaction_id, person_id, value FROM chip_in_payments WHERE chip_in_id = ?')
    .bind(row.id)
    .all<{ transaction_id: string; person_id: string; value: number }>();
  for (const p of results) {
    await creditShare(
      db,
      row,
      { person: p.person_id, transaction: p.transaction_id, value: p.value },
      now,
    );
  }
};

/**
 * Closes a chip-in before it completed: promises are released (nothing was charged for them) and
 * every paid share becomes its payer's credit. Never a refund. Once only.
 */
export const closeChipIn = async (db: D1Database, row: Row, now: number): Promise<void> => {
  const closed = await db
    .prepare(
      `UPDATE chip_ins SET state = 'closed' WHERE id = ? AND state <> 'closed' AND completed_at IS NULL`,
    )
    .bind(row.id)
    .run();
  if (closed.meta.changes === 0) return;
  await db
    .prepare(`UPDATE pledges SET state = 'released' WHERE chip_in_id = ? AND state = 'promised'`)
    .bind(row.id)
    .run();
  await creditAllPayments(db, row, now);
};

const opIdFor = (row: Row, what: string) => opIdFrom(row.created_at, `chip-in:${row.id}:${what}`);

/**
 * The farm write a completed chip-in owes. The gift is written on behalf of whoever started it; if
 * they no longer live on the farm, by the next paying pledger who does (each tried once, by its own
 * op id). Settled when the farm takes it or refuses it for good; a write that failed on the way is
 * tried again on the next read or sweep.
 */
export const deliver = async (env: Bindings, row: Row, now: number): Promise<void> => {
  const db = env.DB;
  const what = whatOf(row);
  const stub = farmStub(env, row.farm_id);
  if (what.for === 'theme') {
    const result = await stub.chipInTheme(await opIdFor(row, 'theme'), what.theme);
    if (result.result === 'rejected') {
      console.warn('chip-in theme left for a keeper to switch on', { reason: result.reason });
    }
  } else {
    const paid = (await pledgesOf(db, row.id))
      .filter((p) => p.state === 'paid')
      .map((p) => p.person_id);
    const candidates = [row.by_id, ...paid].filter(
      (p, i, all) => p !== GONE && all.indexOf(p) === i,
    );
    for (const actor of candidates) {
      const others = paid.filter((p) => p !== actor);
      const result = await stub.chipInGift(await opIdFor(row, `gift:${actor}`), actor, {
        action: 'given',
        gift: `chipin-${row.id}`,
        to: what.to,
        item: what.item,
        wrap: what.wrap,
        ...(what.note === undefined ? {} : { note: what.note }),
        chipIn: row.id,
        ...(others.length > 0 ? { with: others } : {}),
      });
      if (result.result === 'ack') {
        await db.batch([
          db.prepare('UPDATE gifts SET from_id = ? WHERE id = ?').bind(actor, `chipin-${row.id}`),
          db
            .prepare(
              `UPDATE owned_items SET from_id = ? WHERE person_id = ? AND item = ? AND via = 'chip_in'
                 AND from_id IS NOT NULL`,
            )
            .bind(actor, what.to, what.item),
        ]);
        break;
      }
      if (result.reason !== 'not_member') {
        console.error('chip-in gift refused by the farm', { reason: result.reason });
        break;
      }
    }
  }
  await db
    .prepare('UPDATE chip_ins SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL')
    .bind(now, row.id)
    .run();
};

/**
 * Covered and paid: claimed once, then the recipient owns the gift (or the farm the theme), the
 * promises nobody needed are released, and the farm write is made.
 */
const complete = async (env: Bindings, row: Row, now: number) => {
  const db = env.DB;
  const claimed = await db
    .prepare(
      `UPDATE chip_ins SET completed_at = ?1, state = 'covered', covered_at = coalesce(covered_at, ?1)
       WHERE id = ?2 AND completed_at IS NULL AND state <> 'closed'`,
    )
    .bind(now, row.id)
    .run();
  if (claimed.meta.changes === 0) return;
  const what = whatOf(row);
  const from = row.by_id === GONE ? null : row.by_id;
  await db.batch([
    db
      .prepare(`UPDATE pledges SET state = 'released' WHERE chip_in_id = ? AND state = 'promised'`)
      .bind(row.id),
    ...(what.for === 'gift'
      ? [
          db
            .prepare(
              `INSERT OR IGNORE INTO gifts (id, from_id, to_id, farm_id, item, wrap, product, state,
                 chip_in_id, created_at, paid_at, given_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 'given', ?7, ?8, ?8, ?8)`,
            )
            .bind(
              `chipin-${row.id}`,
              from ?? GONE,
              what.to,
              row.farm_id,
              what.item,
              what.wrap,
              row.id,
              now,
            ),
          db
            .prepare(
              `INSERT OR IGNORE INTO owned_items (person_id, item, via, from_id, at) VALUES (?, ?, 'chip_in', ?, ?)`,
            )
            .bind(what.to, what.item, from, now),
        ]
      : [
          db
            .prepare(
              'INSERT OR IGNORE INTO farm_themes (farm_id, theme, chip_in_id, at) VALUES (?, ?, ?, ?)',
            )
            .bind(row.farm_id, what.theme, row.id, now),
        ]),
  ]);
  const after = await rowOf(db, row.id);
  if (after !== null) await deliver(env, after, now);
};

/**
 * Moves a chip-in on as far as its pledges and the clock take it: covered, completed, closed, a
 * theme back to open, or an owed farm write made. Answers the row as it is afterwards.
 */
export const advance = async (env: Bindings, id: string, now: number): Promise<Row | null> => {
  const db = env.DB;
  let row = await rowOf(db, id);
  if (row === null || row.state === 'closed') return row;
  if (row.completed_at !== null) {
    if (row.delivered_at === null) {
      await deliver(env, row, now).catch((error: unknown) =>
        console.error('chip-in farm write failed', {
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
    return rowOf(db, id);
  }
  const pledges = await pledgesOf(db, id);
  if (sum(pledges, ['paid']) >= row.target) {
    await complete(env, row, now);
    return rowOf(db, id);
  }
  if (row.closes_at !== null && row.closes_at <= now) {
    if (row.kind === 'gift') {
      await closeChipIn(db, row, now);
    } else {
      // A theme stays open: its pay window passed, so the unpaid promises go and it fills again.
      await db.batch([
        db
          .prepare(
            `UPDATE chip_ins SET state = 'open', covered_at = NULL, closes_at = NULL
             WHERE id = ? AND completed_at IS NULL`,
          )
          .bind(id),
        db
          .prepare(
            `UPDATE pledges SET state = 'released' WHERE chip_in_id = ? AND state = 'promised'`,
          )
          .bind(id),
      ]);
    }
    return rowOf(db, id);
  }
  if (row.state === 'open' && sum(pledges, COUNTED) >= row.target) {
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
