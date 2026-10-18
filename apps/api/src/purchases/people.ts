import { type PersonMerge, registerAccountDeletionStep, registerMergeStep } from '../auth';
import { transferWrites } from './revenuecat';

/*
 * The shop's part of deleting an account and of merging an anonymous person into a returning one.
 * Rows keyed by the person go with `people` (foreign keys); gifts, chip-ins and book shares name
 * people without one, so they are cleared here. A merge moves everything to the kept person.
 */

const deleteShop = async (db: D1Database, person: string) => {
  await db.batch([
    db.prepare('UPDATE owned_items SET from_id = NULL WHERE from_id = ?').bind(person),
    db.prepare('DELETE FROM gifts WHERE from_id = ?1 OR to_id = ?1').bind(person),
    db.prepare('DELETE FROM chip_ins WHERE by_id = ?').bind(person),
    db.prepare('DELETE FROM book_shares WHERE person_id = ?').bind(person),
    db.prepare("UPDATE book_orders SET by_id = '' WHERE by_id = ?").bind(person),
  ]);
};

registerAccountDeletionStep('shop', (env, person) => deleteShop(env.DB, person));

const moveRows =
  (table: string, key: string, columns: string) => (db: D1Database, m: PersonMerge) => [
    db
      .prepare(
        `INSERT OR IGNORE INTO ${table} (${key}, ${columns}) SELECT ?, ${columns} FROM ${table} WHERE ${key} = ?`,
      )
      .bind(m.into, m.from),
    db.prepare(`DELETE FROM ${table} WHERE ${key} = ?`).bind(m.from),
  ];

const moves = [
  moveRows('farm_plus', 'payer_id', 'farm_id, chosen_at'),
  moveRows('wall_names', 'person_id', 'name, sort_key, at'),
  moveRows('critter_votes', 'person_id', 'season, option, at'),
  moveRows('wishlists', 'person_id', 'item, at'),
  moveRows(
    'pledges',
    'person_id',
    'chip_in_id, tier, value, state, transaction_id, refund_owed, at',
  ),
];

/** Everything the shop keeps for `from`, moved to `into`. */
export const mergeWrites = (db: D1Database, m: PersonMerge): D1PreparedStatement[] => [
  ...transferWrites(db, m.from, m.into),
  ...moves.flatMap((move) => move(db, m)),
  db.prepare('UPDATE gifts SET from_id = ? WHERE from_id = ?').bind(m.into, m.from),
  db.prepare('UPDATE gifts SET to_id = ? WHERE to_id = ?').bind(m.into, m.from),
  db.prepare('UPDATE owned_items SET from_id = ? WHERE from_id = ?').bind(m.into, m.from),
  db.prepare('UPDATE chip_ins SET by_id = ? WHERE by_id = ?').bind(m.into, m.from),
  db
    .prepare('UPDATE OR IGNORE book_shares SET person_id = ? WHERE person_id = ?')
    .bind(m.into, m.from),
  db.prepare('UPDATE book_orders SET by_id = ? WHERE by_id = ?').bind(m.into, m.from),
];

registerMergeStep('shop', mergeWrites);
