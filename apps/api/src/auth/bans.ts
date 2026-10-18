/** The scope of a ban that refuses sign-in, sessions and socket tokens everywhere. */
export const ACCOUNT_BAN_SCOPE = 'account';

/**
 * Whether the person has an account ban in force at `now`. Moderation writes `bans` (through
 * `banPerson`); this is the read path, checked when a session or a socket token is issued and on
 * every request that needs a session.
 */
export async function isBanned(db: D1Database, person: string, now: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS banned FROM bans
       WHERE person_id = ? AND scope = ? AND (until IS NULL OR until > ?)
       LIMIT 1`,
    )
    .bind(person, ACCOUNT_BAN_SCOPE, now)
    .first<{ banned: number }>();
  return row !== null;
}

export interface Ban {
  readonly person: string;
  readonly scope: string;
  /** Epoch ms when the ban ends, or null for good. */
  readonly until: number | null;
  readonly reason: string;
}

/**
 * Writes a ban, replacing any earlier one of the same scope. An account ban also ends every
 * session the person holds, in the same batch, so they are signed out everywhere at once.
 */
export async function banPerson(db: D1Database, ban: Ban): Promise<void> {
  const statements = [
    db
      .prepare(
        `INSERT INTO bans (person_id, scope, until, reason) VALUES (?, ?, ?, ?)
         ON CONFLICT (person_id, scope) DO UPDATE SET until = excluded.until, reason = excluded.reason`,
      )
      .bind(ban.person, ban.scope, ban.until, ban.reason),
  ];
  if (ban.scope === ACCOUNT_BAN_SCOPE) {
    statements.push(db.prepare('DELETE FROM sessions WHERE person_id = ?').bind(ban.person));
  }
  await db.batch(statements);
}
