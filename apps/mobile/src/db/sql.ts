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

/*
 * The phone has one database, and every handle expo-sqlite opens on it shares one native
 * connection. Its `withTransactionAsync` is not exclusive: a second BEGIN fails, and that caller's
 * ROLLBACK ends the first one's transaction, whose COMMIT then finds none. So every write
 * transaction in the app takes its turn in this one queue, whichever store or handle starts it
 * (a data layer started again after a sign-out or a remount holds a second store).
 */
const writes = createSerialQueue();

/**
 * Runs `task` in a transaction on `db`, after every write transaction queued before it. A task
 * must not start another transaction: it would wait for itself.
 */
export function writeTransaction<T>(db: SqlDatabase, task: () => Promise<T>): Promise<T> {
  return writes(async () => {
    let result: T | undefined;
    await db.withTransactionAsync(async () => {
      result = await task();
    });
    return result as T;
  });
}
