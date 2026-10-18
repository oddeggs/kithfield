import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from '@jest/globals';

import { openFileDb } from '../data/test/test-phone';
import { prepareDatabase, type DatabaseDriver, type StoreReset } from './prepare-database';

/*
 * Node's SQLite has no SQLCipher (`PRAGMA key` does nothing there), so these check what happens
 * around the key: a file that isn't a database, and a key that had to be made.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function driver(created: boolean): DatabaseDriver & { path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kithfield-db-'));
  dirs.push(dir);
  const path = join(dir, 'kithfield.db');
  return {
    path,
    open: () => {
      const db = openFileDb(path);
      return Promise.resolve({ ...db, closeAsync: () => Promise.resolve(db.close()) });
    },
    remove: () => {
      const existed = existsSync(path);
      rmSync(path, { force: true });
      return Promise.resolve(existed);
    },
    key: () => Promise.resolve({ key: 'ab'.repeat(32), created }),
    requireCipher: false,
  };
}

describe('opening the store', () => {
  it('starts empty, and says so, when the file is not a database under the key', async () => {
    const d = driver(false);
    writeFileSync(d.path, Buffer.alloc(4096, 7));
    const resets: StoreReset[] = [];
    const db = await prepareDatabase(d, (reason) => resets.push(reason));
    expect(resets).toEqual(['not_a_database']);
    expect(await db.getAllAsync('SELECT * FROM outbox', [])).toEqual([]);
    await db.closeAsync();
  });

  it('deletes a file left from before the key was made, and says so', async () => {
    const first = driver(false);
    const db = await prepareDatabase(first, () => undefined);
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('x', '1')", []);
    await db.closeAsync();

    const resets: StoreReset[] = [];
    const again = await prepareDatabase(
      { ...first, key: () => Promise.resolve({ key: 'cd'.repeat(32), created: true }) },
      (r) => resets.push(r),
    );
    expect(resets).toEqual(['key_missing']);
    expect(await again.getAllAsync('SELECT * FROM meta', [])).toEqual([]);
    await again.closeAsync();
  });

  it('keeps the store and says nothing on an ordinary launch', async () => {
    const d = driver(false);
    const resets: StoreReset[] = [];
    const db = await prepareDatabase(d, (r) => resets.push(r));
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('x', '1')", []);
    await db.closeAsync();
    const again = await prepareDatabase(d, (r) => resets.push(r));
    expect(await again.getAllAsync('SELECT key FROM meta', [])).toEqual([{ key: 'x' }]);
    expect(resets).toEqual([]);
    await again.closeAsync();
  });
});
