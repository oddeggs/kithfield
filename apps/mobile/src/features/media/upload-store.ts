import { File } from 'expo-file-system';

import { uploadsDirectory } from './transport';
import type { UploadBatch } from './upload-model';

/** Where the queue's state lives between launches. */
export interface UploadStore {
  load(): Promise<UploadBatch[]>;
  save(batches: readonly UploadBatch[]): Promise<void>;
}

/** The few file operations the store needs, by file name in the queue's folder. */
export interface QueueFiles {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  /** Moves `from` over `to`, replacing it. */
  replace(from: string, to: string): void;
}

const VERSION = 1;
const MAIN = 'queue.json';
const NEXT = 'queue.next.json';

const parse = (text: string | null): UploadBatch[] | null => {
  if (text === null) return null;
  try {
    const saved = JSON.parse(text) as { version?: number; batches?: UploadBatch[] };
    return saved.version === VERSION && Array.isArray(saved.batches) ? saved.batches : null;
  } catch {
    return null;
  }
};

/**
 * The queue as one JSON file. Written whole to a next copy and moved over the main file, so a
 * crash mid-write leaves a good copy: the main file, or the next one when the move didn't happen.
 */
export function createUploadStore(files: QueueFiles): UploadStore {
  return {
    async load() {
      return parse(await files.read(MAIN)) ?? parse(await files.read(NEXT)) ?? [];
    },
    async save(batches) {
      await files.write(NEXT, JSON.stringify({ version: VERSION, batches }));
      files.replace(NEXT, MAIN);
    },
  };
}

/** The queue's files next to its media in the app's documents. */
export const fileUploadStore = createUploadStore({
  async read(name) {
    const file = new File(uploadsDirectory(), name);
    return file.exists ? file.text() : null;
  },
  write: (name, text) => new File(uploadsDirectory(), name).write(text),
  replace(from, to) {
    const target = new File(uploadsDirectory(), to);
    if (target.exists) target.delete();
    new File(uploadsDirectory(), from).moveSync(target);
  },
});
