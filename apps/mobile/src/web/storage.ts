import type { SessionStorage } from '../data/session';

/** The browser's stand-in for the Keychain: this origin's `localStorage`. */
export interface BrowserStorage extends SessionStorage {
  deleteItemAsync(key: string): Promise<void>;
}

/** A store that forgets on reload, for a browser that refuses storage (private windows, policy). */
function memory(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

function local(): Storage {
  try {
    const probe = '__kithfield_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memory();
  }
}

let shared: Storage | null = null;

/** A storage call as a promise: a throw (storage full) becomes a rejection. */
const settle = <T>(task: () => T): Promise<T> => new Promise((resolve) => resolve(task()));

export function browserStorage(): BrowserStorage {
  const store = (shared ??= local());
  return {
    getItem: (key) => store.getItem(key),
    getItemAsync: (key) => settle(() => store.getItem(key)),
    setItem: (key, value) => store.setItem(key, value),
    setItemAsync: (key, value) => settle(() => store.setItem(key, value)),
    deleteItemAsync: (key) => settle(() => store.removeItem(key)),
  };
}
