import type { PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { syncFromRevenueCat } from './revenuecat';

/*
 * A consumable transaction pays for one gift or one chip-in pledge. It counts once RevenueCat has
 * told us of it (its webhook, or the sync asked here), for the person who paid and the product
 * they were asked to buy, and only for the first thing it is used for.
 */

export type TransactionCheck = 'ok' | 'unknown' | 'used';

type Row = { person_id: string; product: string; used_by: string | null; refunded: number };

const rowOf = (db: D1Database, id: string) =>
  db
    .prepare('SELECT person_id, product, used_by, refunded FROM store_transactions WHERE id = ?')
    .bind(id)
    .first<Row>();

/**
 * Marks `transaction` used by `usedBy` if it is this person's unused purchase of `product`.
 * `used` when it already paid for something else; `unknown` when nothing says it was paid (yet).
 */
export const useTransaction = async (
  env: Pick<Bindings, 'DB' | 'REVENUECAT_SECRET_KEY'>,
  person: PersonId,
  transaction: string,
  product: string,
  usedBy: string,
  now: number,
): Promise<TransactionCheck> => {
  let row = await rowOf(env.DB, transaction);
  if (row === null && (await syncFromRevenueCat(env, person, now))) {
    row = await rowOf(env.DB, transaction);
  }
  if (row === null || row.person_id !== person || row.product !== product || row.refunded !== 0) {
    return 'unknown';
  }
  if (row.used_by !== null) return row.used_by === usedBy ? 'ok' : 'used';
  const claimed = await env.DB.prepare(
    'UPDATE store_transactions SET used_by = ? WHERE id = ? AND used_by IS NULL',
  )
    .bind(usedBy, transaction)
    .run();
  if (claimed.meta.changes > 0) return 'ok';
  return (await rowOf(env.DB, transaction))?.used_by === usedBy ? 'ok' : 'used';
};
