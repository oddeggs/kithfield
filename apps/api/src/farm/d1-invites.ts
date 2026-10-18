import type { FarmId, PersonId } from '@kithfield/contracts';

/*
 * Invites: looked up by a hash of the code; the code itself is kept only sealed (`invite-codes.ts`).
 * A new invite retires the farm's old ones.
 */

export type InviteRow = {
  farm_id: FarmId;
  created_by: PersonId;
  expires_at: number | null;
  uses_left: number | null;
};

export const replaceInvite = async (
  db: D1Database,
  invite: {
    hash: string;
    farm: FarmId;
    by: PersonId;
    expiresAt: number | null;
    sealed: string | null;
  },
) => {
  await db.batch([
    db.prepare('DELETE FROM invites WHERE farm_id = ?').bind(invite.farm),
    db
      .prepare(
        'INSERT INTO invites (code_hash, farm_id, created_by, expires_at, uses_left, code_sealed) VALUES (?, ?, ?, ?, NULL, ?)',
      )
      .bind(invite.hash, invite.farm, invite.by, invite.expiresAt, invite.sealed),
  ]);
};

/** The farm's working invite, with its sealed code; null when it has none, or it expired or ran out. */
export const currentInvite = async (
  db: D1Database,
  farm: FarmId,
  now: number,
): Promise<{ sealed: string | null; expiresAt: number | null } | null> => {
  const row = await db
    .prepare(
      `SELECT code_sealed, expires_at FROM invites
       WHERE farm_id = ? AND (expires_at IS NULL OR expires_at > ?)
         AND (uses_left IS NULL OR uses_left > 0)
       LIMIT 1`,
    )
    .bind(farm, now)
    .first<{ code_sealed: string | null; expires_at: number | null }>();
  return row === null ? null : { sealed: row.code_sealed, expiresAt: row.expires_at };
};

/** A working invite by its code's hash: not expired, uses left. */
export const liveInvite = async (
  db: D1Database,
  hash: string,
  now: number,
): Promise<InviteRow | null> => {
  const row = await db
    .prepare('SELECT farm_id, created_by, expires_at, uses_left FROM invites WHERE code_hash = ?')
    .bind(hash)
    .first<InviteRow>();
  if (row === null) return null;
  if (row.expires_at !== null && row.expires_at <= now) return null;
  return row.uses_left !== null && row.uses_left <= 0 ? null : row;
};

export const useInvite = async (db: D1Database, hash: string) => {
  await db
    .prepare(
      'UPDATE invites SET uses_left = uses_left - 1 WHERE code_hash = ? AND uses_left IS NOT NULL',
    )
    .bind(hash)
    .run();
};
