import { describe, expect, it } from '@jest/globals';

import { runMigrations } from '../db/migrate';
import { MIGRATIONS } from '../db/migrations';
import { createSyncStore, type SyncStore } from './sync-store';
import { openFileDb } from './test/test-phone';

/** What a received page leaves: the farm's new head and a note beside it, in one transaction. */
const receive = (store: SyncStore, farm: string, seq: number) =>
  store.transaction(async () => {
    await store.saveFarm({ farm, lastSeq: seq, state: null, needsSnapshot: false }, seq);
    await store.setMeta(`head:${farm}`, String(seq));
  });

describe('write transactions', () => {
  it('commit for two farms received at once, with the cottage writing alongside', async () => {
    const db = openFileDb(':memory:');
    await runMigrations(db, MIGRATIONS);
    const store = createSyncStore(db);
    await Promise.all(
      [1, 2, 3].flatMap((seq) => [
        receive(store, 'f_one', seq),
        receive(store, 'f_two', seq),
        store.transaction(() => store.replaceChats([])),
      ]),
    );
    expect((await store.farm('f_one')).lastSeq).toBe(3);
    expect((await store.farm('f_two')).lastSeq).toBe(3);
    db.close();
  });

  it('take turns across stores over one connection, as when the data layer starts again', async () => {
    const db = openFileDb(':memory:');
    await runMigrations(db, MIGRATIONS);
    const before = createSyncStore(db);
    const after = createSyncStore(db);
    await Promise.all(
      [1, 2, 3].flatMap((seq) => [receive(before, 'f_one', seq), receive(after, 'f_two', seq)]),
    );
    expect((await after.farm('f_one')).lastSeq).toBe(3);
    expect((await after.farm('f_two')).lastSeq).toBe(3);
    expect(await after.meta('head:f_one')).toBe('3');
    expect(await after.meta('head:f_two')).toBe('3');
    db.close();
  });

  it('take turns with a migration run on another handle', async () => {
    const db = openFileDb(':memory:');
    await runMigrations(db, MIGRATIONS);
    const store = createSyncStore(db);
    const later = { name: '0999_later', sql: 'CREATE TABLE later (x INTEGER);' };
    await Promise.all([
      receive(store, 'f_one', 1),
      runMigrations(db, [...MIGRATIONS, later]),
      receive(store, 'f_two', 1),
    ]);
    expect((await store.farm('f_one')).lastSeq).toBe(1);
    expect((await store.farm('f_two')).lastSeq).toBe(1);
    db.close();
  });
});
