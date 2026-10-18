/**
 * A person's display name, for push copy. Read from D1's `people` table (`backend.md` §4); a
 * deleted account, an unnamed person or a database without that table yet gives null, and the
 * push reads "A friend" instead.
 */
export async function displayNameOf(db: D1Database, person: string): Promise<string | null> {
  try {
    const row = await db
      .prepare('SELECT display_name AS name FROM people WHERE id = ? AND deleted_at IS NULL')
      .bind(person)
      .first<{ name: string | null }>();
    return row?.name ?? null;
  } catch (error) {
    console.warn('display name lookup failed', { error: String(error) });
    return null;
  }
}
