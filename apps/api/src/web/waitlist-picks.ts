import { UNCONFIRMED_KEEP_MS, confirmationToken, sha256Hex } from './waitlist-store';

/*
 * Early critter picks from the launch list's thank-you page (`docs/backend.md` §4). Every sign-up
 * answer carries a fresh pick token; only its SHA-256 is kept. The letter step binds the pick to the
 * address's pending confirmation, and confirming copies the bound pick's species onto the row. A
 * pick for an address that was already confirmed stays unbound, so it is kept but never used.
 */

/** Mints a pick for one sign-up answer and keeps its hash; the same work whoever asked. */
export async function mintPick(db: D1Database, emailHash: string, now: number): Promise<string> {
  const pick = confirmationToken();
  await db
    .prepare('INSERT INTO waitlist_picks (pick_hash, email_hash, requested_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(pick), emailHash, now)
    .run();
  return pick;
}

/** Binds a pick to the pending confirmation its request made or found. */
export async function bindPick(db: D1Database, pick: string, confirmHash: string): Promise<void> {
  await db
    .prepare('UPDATE waitlist_picks SET confirm_hash = ? WHERE pick_hash = ?')
    .bind(confirmHash, await sha256Hex(pick))
    .run();
}

/** Saves the species on a pick; false when the pick is unknown or over a week old. */
export async function savePick(
  db: D1Database,
  input: { pick: string; species: string; now: number },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE waitlist_picks SET species = ?1, picked_at = ?2
       WHERE pick_hash = ?3 AND requested_at > ?4`,
    )
    .bind(input.species, input.now, await sha256Hex(input.pick), input.now - UNCONFIRMED_KEEP_MS)
    .run();
  return result.meta.changes > 0;
}

/**
 * Confirms the address whose letter carried this confirmation, copying the species of the latest
 * pick bound to it. Null when the link is used, expired, replaced or unknown.
 */
export async function confirmWithPick(
  db: D1Database,
  input: { confirmHash: string; now: number },
): Promise<{ lang: string } | null> {
  return db
    .prepare(
      `UPDATE waitlist SET confirmed_at = ?1, confirm_hash = NULL,
         species = coalesce((
           SELECT species FROM waitlist_picks
           WHERE confirm_hash = ?2 AND species IS NOT NULL
           ORDER BY picked_at DESC, rowid DESC LIMIT 1
         ), species)
       WHERE confirm_hash = ?2 AND confirmed_at IS NULL AND created_at > ?3
       RETURNING lang`,
    )
    .bind(input.now, input.confirmHash, input.now - UNCONFIRMED_KEEP_MS)
    .first<{ lang: string }>();
}
