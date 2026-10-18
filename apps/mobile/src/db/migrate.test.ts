import { describe, expect, it } from '@jest/globals';

import { openFileDb } from '../data/test/test-phone';
import { type Migration, runMigrations } from './migrate';
import { MIGRATIONS } from './migrations';

describe('migrations', () => {
  it('apply once each, in name order, and record what ran', async () => {
    const db = openFileDb(':memory:');
    const later: Migration = { name: '0009_later', sql: 'CREATE TABLE later (x INTEGER);' };
    expect(await runMigrations(db, [later, ...MIGRATIONS])).toEqual([
      '0001_sync_store',
      '0002_event_day',
      '0009_later',
    ]);
    expect(await runMigrations(db, [later, ...MIGRATIONS])).toEqual([]);
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      [],
    );
    expect(tables.map((t) => t.name)).toEqual([
      '_migrations',
      'chats',
      'events',
      'farms',
      'invalid_events',
      'later',
      'meta',
      'outbox',
      'rejections',
    ]);
    db.close();
  });

  it('leave a failed migration unrecorded and earlier ones in place', async () => {
    const db = openFileDb(':memory:');
    const broken: Migration = { name: '0009_broken', sql: 'CREATE TABLE nope (;' };
    await expect(runMigrations(db, [...MIGRATIONS, broken])).rejects.toThrow();
    const ran = await db.getAllAsync<{ name: string }>('SELECT name FROM _migrations', []);
    expect(ran.map((r) => r.name)).toEqual(['0001_sync_store', '0002_event_day']);
    db.close();
  });
});
