import type { Database, SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';

import { loadSaved, removeSaved, saveSoon, wasmUrl } from '../web/persist';
import { prepareDatabase, type OpenedDatabase, type StoreReset } from './prepare-database';
import type { SqlValue } from './sql';

export const DATABASE_NAME = 'kithfield.db';

let engine: Promise<SqlJsStatic> | null = null;
const sqlJs = () => (engine ??= initSqlJs({ locateFile: wasmUrl }));

/**
 * Settings for each connection: deleted rows are overwritten, so a wiped store's saved copy (it
 * is not encrypted here) keeps none of what was in it, and foreign keys as on the phone.
 */
const CONNECTION_SETTINGS = 'PRAGMA secure_delete = ON; PRAGMA foreign_keys = ON;';

/**
 * The browser's store: SQLite (sql.js, in memory) with the same tables as the phone, saved to
 * IndexedDB a moment after each write so a reload keeps the outbox. The browser has no SQLCipher;
 * what it holds is protected by the browser profile, as a web session is.
 */
function wrap(db: Database, name: string): OpenedDatabase {
  const rows = <T>(source: string, params: SqlValue[]): T[] => {
    const statement = db.prepare(source);
    try {
      statement.bind(params);
      const out: T[] = [];
      while (statement.step()) out.push(statement.getAsObject() as T);
      return out;
    } finally {
      statement.free();
    }
  };
  let depth = 0;
  // sql.js's export closes and reopens the connection: it would end an open transaction (losing
  // its writes) and resets the connection's settings, so it waits for the transaction and puts
  // the settings back.
  const take = (): Uint8Array | null => {
    if (depth > 0) return null;
    const bytes = db.export();
    db.exec(CONNECTION_SETTINGS);
    return bytes;
  };
  const changed = () => saveSoon(name, take);
  // sql.js is synchronous; a throw becomes a rejection, as from expo-sqlite.
  const run = <T>(task: () => T): Promise<T> => new Promise((resolve) => resolve(task()));
  db.exec(CONNECTION_SETTINGS);
  return {
    execAsync: (source) =>
      run(() => {
        db.exec(source);
        if (depth === 0) changed();
      }),
    getAllAsync: <T>(source: string, params: SqlValue[]) => run(() => rows<T>(source, params)),
    runAsync: (source, params) =>
      run(() => {
        db.run(source, params);
        if (depth === 0) changed();
        return { changes: db.getRowsModified() };
      }),
    withTransactionAsync: async (task) => {
      db.exec('BEGIN');
      depth += 1;
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        depth -= 1;
      }
      changed();
    },
    closeAsync: () => run(() => db.close()),
  };
}

/** Opens the browser's store and brings it to the current schema. */
export function openDatabase(
  onReset: (reason: StoreReset) => void,
  name: string = DATABASE_NAME,
): Promise<OpenedDatabase> {
  return prepareDatabase(
    {
      open: async () => {
        const SQL = await sqlJs();
        const saved = await loadSaved(name);
        return wrap(saved ? new SQL.Database(saved) : new SQL.Database(), name);
      },
      remove: () => removeSaved(name),
      // No cipher on the web: `PRAGMA key` is ignored by plain SQLite.
      key: () => Promise.resolve({ key: '00', created: false }),
      requireCipher: false,
    },
    onReset,
  );
}
