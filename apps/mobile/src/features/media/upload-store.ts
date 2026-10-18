import { File } from 'expo-file-system';

import { uploadsDirectory } from './transport';
import type { UploadBatch } from './upload-model';

/** Where the queue's state lives between launches. */
export interface UploadStore {
  load(): Promise<UploadBatch[]>;
  save(batches: readonly UploadBatch[]): Promise<void>;
}

const VERSION = 1;

/**
 * The queue as one JSON file next to its media in the app's documents. Written whole to a new
 * file and moved over the old one, so a crash mid-write leaves the last good copy.
 */
export const fileUploadStore: UploadStore = {
  async load() {
    const file = new File(uploadsDirectory(), 'queue.json');
    if (!file.exists) return [];
    try {
      const saved = JSON.parse(await file.text()) as { version?: number; batches?: UploadBatch[] };
      return saved.version === VERSION && Array.isArray(saved.batches) ? saved.batches : [];
    } catch {
      return [];
    }
  },

  async save(batches) {
    const dir = uploadsDirectory();
    const next = new File(dir, 'queue.next.json');
    await next.write(JSON.stringify({ version: VERSION, batches }));
    const file = new File(dir, 'queue.json');
    if (file.exists) file.delete();
    next.moveSync(file);
  },
};
