/** The scope of a ban that refuses sign-in and socket tokens everywhere. */
export const ACCOUNT_BAN_SCOPE = 'account';

/**
 * Whether the person has an account ban in force at `now`. Moderation writes `bans`; this is the
 * read path, checked whenever a session or a socket token is issued.
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
