import { webAsset } from './base-url';

const DB_NAME = 'kithfield';
const STORE = 'files';
const SAVE_AFTER_MS = 250;

/** Where sql.js finds its WebAssembly: copied into `public/` beside the app. */
export const wasmUrl = (file: string): string => webAsset(file);

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await idb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = act(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

/** The saved database file, or null when there is none (or the browser keeps no storage). */
export async function loadSaved(name: string): Promise<Uint8Array | null> {
  try {
    const value = await run<unknown>('readonly', (store) => store.get(name));
    return value instanceof Uint8Array ? value : null;
  } catch {
    return null;
  }
}

/** Deletes the saved file; answers whether there was one. */
export async function removeSaved(name: string): Promise<boolean> {
  const had = (await loadSaved(name)) !== null;
  pending.delete(name);
  await run('readwrite', (store) => store.delete(name)).catch(() => undefined);
  return had;
}

const pending = new Map<string, () => Uint8Array>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  timer = null;
  const due = [...pending];
  pending.clear();
  for (const [name, take] of due) {
    await run('readwrite', (store) => store.put(take(), name)).catch(() => undefined);
  }
}

/**
 * Saves the database a moment after a write, so a burst of writes is one save. The export runs
 * when the save does, so it always holds the newest state. Leaving the page saves at once.
 */
export function saveSoon(name: string, take: () => Uint8Array): void {
  pending.set(name, take);
  timer ??= setTimeout(() => void flush(), SAVE_AFTER_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (timer !== null) clearTimeout(timer);
    void flush();
  });
}
