import { webAsset } from './base-url';

const DB_NAME = 'kithfield';
const STORE = 'files';
const SAVE_AFTER_MS = 250;

/** Where sql.js finds its WebAssembly: copied into `public/` beside the app. */
export const wasmUrl = (file: string): string => webAsset(file);

/**
 * The page's one IndexedDB connection, kept open: a page being hidden or closed has no time to
 * open one, so the last save must start its transaction at once.
 */
let connection: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

function idb(): Promise<IDBDatabase> {
  if (connection) return Promise.resolve(connection);
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the store: let it, and open again when next asked.
      db.onversionchange = () => {
        db.close();
        if (connection === db) connection = null;
      };
      connection = db;
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  }).finally(() => {
    opening = null;
  });
  return opening;
}

function request<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  act: (s: IDBObjectStore) => IDBRequest<T>,
) {
  return new Promise<T>((resolve, reject) => {
    const req = act(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

/**
 * Takes a database's bytes for saving, or null while it can't be read whole (a transaction is
 * open), in which case the save waits for the next one.
 */
export type TakeBytes = () => Uint8Array | null;

const pending = new Map<string, TakeBytes>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** Saves run one after another, so a newer copy never lands under an older one. */
let saving: Promise<void> = Promise.resolve();

/** Writes the due copies in one transaction on `db`, started now. */
function write(db: IDBDatabase, due: readonly (readonly [string, Uint8Array])[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [name, bytes] of due) store.put(bytes, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      // The connection closed under us (another tab deleting the store): open again next time.
      if (connection === db) connection = null;
      resolve();
    }
  });
}

/** Takes every pending copy now; one that can't be taken yet stays pending. */
function takeDue(): [string, Uint8Array][] {
  const due: [string, Uint8Array][] = [];
  for (const [name, take] of [...pending]) {
    let bytes: Uint8Array | null;
    try {
      bytes = take();
    } catch {
      // A closed database has nothing newer to save.
      pending.delete(name);
      continue;
    }
    if (bytes === null) continue;
    pending.delete(name);
    due.push([name, bytes]);
  }
  return due;
}

function schedule(): void {
  timer ??= setTimeout(() => void flush(), SAVE_AFTER_MS);
}

/** Saves what is pending now, after any save already under way. */
function flush(): Promise<void> {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  const db = connection;
  if (db) {
    // The copies are taken and their transaction started in this turn, so a page being hidden or
    // closed still commits it. Transactions on one store run in the order they start, so it lands
    // after any save before it.
    const due = takeDue();
    if (pending.size > 0) schedule();
    if (due.length > 0) {
      const done = write(db, due);
      saving = saving.then(() => done);
    }
    return saving;
  }
  saving = saving
    .then(async () => {
      const opened = await idb();
      const due = takeDue();
      if (pending.size > 0) schedule();
      if (due.length > 0) await write(opened, due);
    })
    .catch(() => undefined);
  return saving;
}

/** The saved database file, or null when there is none (or the browser keeps no storage). */
export async function loadSaved(name: string): Promise<Uint8Array | null> {
  try {
    // A copy still waiting to be saved is newer than the stored one (a sign-out wipes, then the
    // store opens again at once): save it first, so it is what opens.
    if (pending.has(name)) await flush();
    else await saving;
    const value = await request<unknown>(await idb(), 'readonly', (store) => store.get(name));
    return value instanceof Uint8Array ? value : null;
  } catch {
    return null;
  }
}

/** Deletes the saved file; answers whether there was one. */
export async function removeSaved(name: string): Promise<boolean> {
  pending.delete(name);
  const had = (await loadSaved(name)) !== null;
  try {
    await request(await idb(), 'readwrite', (store) => store.delete(name));
  } catch {
    // Nothing kept, or the browser keeps no storage.
  }
  return had;
}

/**
 * Saves the database a moment after a write, so a burst of writes is one save. The bytes are
 * taken when the save runs, so it always holds the newest state. Hiding or leaving the page saves
 * at once.
 */
export function saveSoon(name: string, take: TakeBytes): void {
  pending.set(name, take);
  schedule();
}

if (typeof window !== 'undefined') {
  // Open early, so a save on the way out never waits for it.
  void idb().catch(() => undefined);
  const now = () => {
    if (pending.size > 0) void flush();
  };
  window.addEventListener('pagehide', now);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') now();
  });
}
