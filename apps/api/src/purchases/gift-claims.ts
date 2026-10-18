import type { FarmCommand, GateGesture, OpId, PersonId } from '@kithfield/contracts';

/*
 * The farm takes a gift id only from its giver, paid and not given yet, and only once. Before a
 * `gift {given}` (or a gift at the gate) is written, the gift is claimed in D1 for that write's op
 * id, and its recipient owns the item from then on. If the farm then refuses the write, the claim
 * is released. A retried op id finds its own claim again.
 */

export type GiftClaim = {
  readonly gift: string;
  readonly giver: PersonId;
  readonly to: PersonId;
  readonly item: string;
  readonly wrap: string;
  readonly opId: OpId;
};

/** The claim a `gift {given}` command or a gift at the gate makes, or null for anything else. */
export const claimOf = (
  write: FarmCommand | { kind: 'gate'; opId: OpId; payload: GateGesture },
  giver: PersonId,
): GiftClaim | null => {
  if (write.kind === 'gift' && write.payload.action === 'given') {
    const p = write.payload;
    return { gift: p.gift, giver, to: p.to, item: p.item, wrap: p.wrap, opId: write.opId };
  }
  if (write.kind === 'gate' && write.payload.gesture === 'gift') {
    const p = write.payload;
    return { gift: p.gift, giver, to: p.to, item: p.item, wrap: p.wrap, opId: write.opId };
  }
  return null;
};

/** Claims a paid gift for one write. False when it isn't this giver's, paid, for this friend. */
export const claimGift = async (db: D1Database, c: GiftClaim, now: number): Promise<boolean> => {
  const [claimed] = await db.batch([
    db
      .prepare(
        `UPDATE gifts SET state = 'given', op_id = ?1, given_at = coalesce(given_at, ?2)
         WHERE id = ?3 AND from_id = ?4 AND to_id = ?5 AND item = ?6 AND wrap = ?7
           AND (state = 'paid' OR (state = 'given' AND op_id = ?1))`,
      )
      .bind(c.opId, now, c.gift, c.giver, c.to, c.item, c.wrap),
    db
      .prepare(
        `INSERT OR IGNORE INTO owned_items (person_id, item, via, from_id, at)
         SELECT to_id, item, 'gift', from_id, ?1 FROM gifts
         WHERE id = ?2 AND op_id = ?3 AND state = 'given'`,
      )
      .bind(now, c.gift, c.opId),
    // Remembers whether this claim is what gave the item (the insert above wasn't ignored).
    db
      .prepare(
        `UPDATE gifts SET granted = max(granted, changes()) WHERE id = ? AND op_id = ? AND state = 'given'`,
      )
      .bind(c.gift, c.opId),
  ]);
  return (claimed?.meta.changes ?? 0) > 0;
};

/** The farm refused the write after all: the gift is paid and waiting again. */
export const releaseGift = async (db: D1Database, c: GiftClaim): Promise<void> => {
  await db.batch([
    db
      .prepare(
        `DELETE FROM owned_items WHERE via = 'gift' AND EXISTS (
           SELECT 1 FROM gifts g WHERE g.id = ?1 AND g.op_id = ?2 AND g.state = 'given'
             AND g.granted = 1 AND owned_items.person_id = g.to_id AND owned_items.item = g.item
             AND owned_items.from_id = g.from_id)`,
      )
      .bind(c.gift, c.opId),
    db
      .prepare(
        `UPDATE gifts SET state = 'paid', op_id = NULL, given_at = NULL, granted = 0
         WHERE id = ? AND op_id = ? AND state = 'given'`,
      )
      .bind(c.gift, c.opId),
  ]);
};

/** The recipient opened it: the giver sees "opened", never when. */
export const markGiftOpened = async (
  db: D1Database,
  gift: string,
  by: PersonId,
  now: number,
): Promise<void> => {
  await db
    .prepare(
      `UPDATE gifts SET state = 'opened', opened_at = ? WHERE id = ? AND to_id = ? AND state = 'given'`,
    )
    .bind(now, gift, by)
    .run();
};

/** Whether a farm owns a theme (covered once by friends' chip-in), so a keeper may show it. */
export const farmOwnsTheme = async (
  db: D1Database,
  farm: string,
  theme: string,
): Promise<boolean> =>
  (await db
    .prepare('SELECT 1 FROM farm_themes WHERE farm_id = ? AND theme = ?')
    .bind(farm, theme)
    .first()) !== null;
