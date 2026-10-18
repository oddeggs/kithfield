import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';

/*
 * The App Group the app shares with its extensions: files at `APP_GROUP_PATHS`
 * (`@kithfield/contracts`), read and written by path inside the group.
 */

export interface GroupStore {
  read(path: string): Promise<string | null>;
  write(path: string, data: string | Uint8Array): Promise<void>;
  exists(path: string): boolean;
  delete(path: string): void;
  /** File names directly inside a folder path (ending in `/`). */
  list(folder: string): string[];
  /** A `file://` URI for a path, for code that takes one (uploads). */
  uri(path: string): string;
}

const appGroup = () => (Constants.expoConfig?.extra as { appGroup?: string } | undefined)?.appGroup;

/** The group's container, or null where it isn't there (tests, Android, a build without it). */
export function groupRoot(): Directory | null {
  const group = appGroup();
  if (group === undefined) return null;
  try {
    return Paths.appleSharedContainers[group] ?? null;
  } catch {
    return null;
  }
}

function parentOf(root: Directory, path: string): Directory {
  const parts = path.split('/').slice(0, -1).filter(Boolean);
  const folder = new Directory(root, ...parts);
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return folder;
}

export function nativeGroupStore(root: Directory): GroupStore {
  const file = (path: string) => new File(root, path);
  return {
    async read(path) {
      const f = file(path);
      return f.exists ? f.text() : null;
    },
    write(path, data) {
      parentOf(root, path);
      // Written beside, then moved over, so an extension never reads half a file.
      const temp = file(`${path}.tmp`);
      if (temp.exists) temp.delete();
      temp.writeSync(data);
      temp.moveSync(file(path), { overwrite: true });
      return Promise.resolve();
    },
    exists: (path) => file(path).exists,
    delete(path) {
      const f = file(path);
      if (f.exists) f.delete();
    },
    list(folder) {
      const dir = new Directory(root, folder);
      if (!dir.exists) return [];
      return dir.list().flatMap((entry) => (entry instanceof File ? [entry.name] : []));
    },
    uri: (path) => file(path).uri,
  };
}
