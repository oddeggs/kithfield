import { runMigrations } from './migrate';
import { MIGRATIONS } from './migrations';
import type { SqlDatabase } from './sql';

export interface OpenedDatabase extends SqlDatabase {
  closeAsync(): Promise<void>;
}

/** Why the store was emptied: its key was gone, or the file wasn't a database under the key. */
export type StoreReset = 'key_missing' | 'not_a_database';

/** The platform's side of opening the store: expo-sqlite and the Keychain on the phone. */
export interface DatabaseDriver {
  open(): Promise<OpenedDatabase>;
  /** Deletes the file; answers whether there was one. */
  remove(): Promise<boolean>;
  /** The SQLCipher key, and whether it was just made (so no file can be read with it). */
  key(): Promise<{ readonly key: string; readonly created: boolean }>;
  /** A build that must have SQLCipher refuses to write a plain file. */
  readonly requireCipher: boolean;
}

/** SQLITE_NOTADB, by message: errors from a native module may not be this realm's `Error`. */
const notADatabase = (error: unknown) =>
  /not a database|SQLITE_NOTADB|code 26\b/i.test(String((error as { message?: unknown })?.message));

/** Opens the file, keys it, and reads it once: the read is what finds a file it can't open. */
async function keyed(driver: DatabaseDriver, key: string): Promise<OpenedDatabase> {
  const db = await driver.open();
  try {
    await db.execAsync(`PRAGMA key = "x'${key}'"`);
    await db.getAllAsync('SELECT count(*) FROM sqlite_master', []);
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

/**
 * Opens the encrypted store and brings it to the current schema. The key is the first statement
 * on the connection. A file this phone can't read is deleted and the store starts empty, with a
 * `store_reset` report: when the key had to be made (a restore without the Keychain), or when the
 * first read under the key says the file isn't a database. The outbox is not a cache, so the
 * Keychain item travels with encrypted backups and device moves (see `database-key.ts`), and a
 * reset is rare.
 */
export async function prepareDatabase(
  driver: DatabaseDriver,
  onReset: (reason: StoreReset) => void,
): Promise<OpenedDatabase> {
  const { key, created } = await driver.key();
  if (created && (await driver.remove())) onReset('key_missing');

  let db: OpenedDatabase;
  try {
    db = await keyed(driver, key);
  } catch (error) {
    if (!notADatabase(error)) throw error;
    await driver.remove();
    onReset('not_a_database');
    db = await keyed(driver, key);
  }

  if (driver.requireCipher) {
    const cipher = await db.getAllAsync<{ cipher_version: string }>('PRAGMA cipher_version', []);
    if (!cipher[0]?.cipher_version) throw new Error('SQLCipher is not linked into this build');
  }
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await runMigrations(db, MIGRATIONS);
  return db;
}
