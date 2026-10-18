import { describe, expect, it } from '@jest/globals';

import { createUploadStore, type QueueFiles } from './upload-store';

const memory = (files: Record<string, string>): QueueFiles & { files: Record<string, string> } => ({
  files,
  read: (name) => Promise.resolve(files[name] ?? null),
  write: (name, text) => {
    files[name] = text;
    return Promise.resolve();
  },
  replace: (from, to) => {
    const text = files[from];
    if (text !== undefined) files[to] = text;
    delete files[from];
  },
});

describe('the saved queue', () => {
  it('falls back to the copy being written when the main file is missing or broken', async () => {
    const batch = { id: 'b1' };
    const next = JSON.stringify({ version: 1, batches: [batch] });
    expect(await createUploadStore(memory({ 'queue.next.json': next })).load()).toEqual([batch]);
    expect(
      await createUploadStore(memory({ 'queue.json': '{"vers', 'queue.next.json': next })).load(),
    ).toEqual([batch]);
  });

  it('writes the next copy, then moves it over the main file', async () => {
    const fs = memory({});
    const store = createUploadStore(fs);
    await store.save([]);
    expect(Object.keys(fs.files)).toEqual(['queue.json']);
    expect(await store.load()).toEqual([]);
  });
});
