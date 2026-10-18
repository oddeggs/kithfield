export type SqlValue = string | number | null;

/**
 * The part of an expo-sqlite database the app's stores use. The real one is expo-sqlite's
 * `SQLiteDatabase` (SQLCipher); tests pass Node's own SQLite with the same shape.
 */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/**
 * Runs tasks one at a time, in the order they were queued. expo-sqlite's transactions are not
 * exclusive: another task's statements could land inside one, so every write goes through here.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}

export type SerialQueue = ReturnType<typeof createSerialQueue>;
