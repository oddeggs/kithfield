import { openDatabaseAsync } from 'expo-sqlite';

import { databaseKey } from './database-key';
import { runMigrations } from './migrate';
import { MIGRATIONS } from './migrations';
import type { SqlDatabase } from './sql';

export const DATABASE_NAME = 'kithfield.db';

/**
 * Opens the encrypted store and brings it to the current schema. The key must be the first
 * statement on the connection; reading `cipher_version` proves SQLCipher is linked, so a build
 * without it fails here instead of writing a plain file.
 */
export async function openDatabase(name: string = DATABASE_NAME): Promise<SqlDatabase> {
  const key = await databaseKey(name);
  const db = await openDatabaseAsync(name);
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  const cipher = await db.getAllAsync<{ cipher_version: string }>('PRAGMA cipher_version', []);
  if (!cipher[0]?.cipher_version) throw new Error('SQLCipher is not linked into this build');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await runMigrations(db, MIGRATIONS);
  return db;
}
