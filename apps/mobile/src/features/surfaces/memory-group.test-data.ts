import type { GroupStore } from './group-store';

/** An App Group in memory, for tests. */
export function memoryGroup(files: Record<string, string> = {}): GroupStore & {
  readonly files: Map<string, string | Uint8Array>;
} {
  const map = new Map<string, string | Uint8Array>(Object.entries(files));
  return {
    files: map,
    read: (path) => {
      const value = map.get(path);
      return Promise.resolve(typeof value === 'string' ? value : null);
    },
    write: (path, data) => {
      map.set(path, data);
      return Promise.resolve();
    },
    exists: (path) => map.has(path),
    delete: (path) => {
      map.delete(path);
    },
    list: (folder) =>
      [...map.keys()]
        .filter((k) => k.startsWith(folder) && !k.slice(folder.length).includes('/'))
        .map((k) => k.slice(folder.length)),
    uri: (path) => `file:///group/${path}`,
    deleteFolder: (folder) => {
      for (const key of [...map.keys()]) if (key.startsWith(folder)) map.delete(key);
    },
  };
}
