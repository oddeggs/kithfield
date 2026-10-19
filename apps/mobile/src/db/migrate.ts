import { writeTransaction, type SqlDatabase } from './sql';

/** One schema change. Its name is its file name, which is also the order it runs in. */
export interface Migration {
  readonly name: string;
  readonly sql: string;
}

/**
 * Applies every migration the database has not seen, in name order, and returns the names it
 * applied. Each one commits together with its own record, so a failure leaves earlier migrations
 * in place and the failed one unrecorded.
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[],
): Promise<string[]> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)',
  );
  const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM _migrations', []);
  const applied = new Set(rows.map((row) => row.name));
  const pending = migrations
    .filter((migration) => !applied.has(migration.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const migration of pending) {
    await writeTransaction(db, async () => {
      await db.execAsync(migration.sql);
      await db.runAsync('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)', [
        migration.name,
        Date.now(),
      ]);
    });
  }
  return pending.map((migration) => migration.name);
}
