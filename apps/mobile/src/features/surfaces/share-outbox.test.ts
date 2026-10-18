import { describe, expect, it, jest } from '@jest/globals';

import { memoryGroup } from './memory-group.test-data';
import { drainShares, pendingDrafts, type ShareSender } from './share-outbox';

const dir = 'surfaces/share-outbox/';
const opA = '01890000-0000-7000-8000-00000000000a';
const opB = '01890000-0000-7000-8000-00000000000b';
const photo = { path: `${dir}${opA}-0.jpg`, mime: 'image/jpeg', bytes: 2000 };
const pdf = { path: `${dir}${opA}-1.pdf`, mime: 'application/pdf', bytes: 300 };

const draft = (opId: string, farm: string, extra: object) =>
  JSON.stringify({ opId, farm, at: 1_000, files: [], ...extra });

function sender() {
  const calls: unknown[][] = [];
  const send: ShareSender = {
    media: (...args) => Promise.resolve(void calls.push(['media', ...args])),
    documents: (...args) => Promise.resolve(void calls.push(['documents', ...args])),
    words: (...args) => Promise.resolve(void calls.push(['words', ...args])),
  };
  return { send, calls };
}

describe('the share extension’s drafts', () => {
  it('sends a share to each farm chosen, then clears the drafts and their files', async () => {
    const group = memoryGroup({
      [`${dir}${opA}.json`]: draft(opA, 'f_lot', { files: [photo, pdf], text: 'the river ones' }),
      [`${dir}${opB}.json`]: draft(opB, 'v_otis', { files: [photo] }),
      [photo.path]: 'jpeg',
      [pdf.path]: 'pdf',
    });
    const { send, calls } = sender();
    expect(await drainShares(group, send)).toEqual(['f_lot', 'v_otis']);
    expect(
      calls.map((c) => [c[0], c[1], (c[2] as { name: string }[]).map((f) => f.name), c[3]]),
    ).toEqual([
      ['media', 'f_lot', [`${opA}-0.jpg`], 'the river ones'],
      ['documents', 'f_lot', [`${opA}-1.pdf`], undefined],
      ['media', 'v_otis', [`${opA}-0.jpg`], undefined],
    ]);
    expect([...group.files.keys()]).toEqual([]);
  });

  it('keeps a file another waiting draft still points at', async () => {
    const group = memoryGroup({
      [`${dir}${opA}.json`]: draft(opA, 'f_lot', { files: [photo] }),
      [`${dir}${opB}.json`]: draft(opB, 'v_otis', { files: [photo] }),
      [photo.path]: 'jpeg',
    });
    const { send } = sender();
    const failing: ShareSender = {
      ...send,
      media: jest.fn((farm: string) =>
        farm === 'v_otis' ? Promise.reject(new Error('offline')) : Promise.resolve(),
      ),
    };
    expect(await drainShares(group, failing)).toEqual(['f_lot']);
    expect(group.exists(photo.path)).toBe(true);
    expect(group.exists(`${dir}${opB}.json`)).toBe(true);
  });

  it('sends words or a link under the draft’s own op id', async () => {
    const group = memoryGroup({
      [`${dir}${opA}.json`]: draft(opA, 'f_lot', { url: 'https://example.com/a', text: 'look' }),
    });
    const { send, calls } = sender();
    await drainShares(group, send);
    expect(calls).toEqual([['words', 'f_lot', opA, 'look', 'https://example.com/a']]);
  });

  it('never sends a part twice: a retry picks up after the parts that already went', async () => {
    const group = memoryGroup({
      [`${dir}${opA}.json`]: draft(opA, 'f_lot', { files: [photo, pdf], text: 'look' }),
      [photo.path]: 'jpeg',
      [pdf.path]: 'pdf',
    });
    const { send, calls } = sender();
    const flaky: ShareSender = {
      ...send,
      documents: () => Promise.reject(new Error('offline')),
    };
    expect(await drainShares(group, flaky)).toEqual([]);
    expect(calls.map((c) => c[0])).toEqual(['media']);
    expect(await drainShares(group, send)).toEqual(['f_lot']);
    // The photos went the first time; only the file goes now.
    expect(calls.map((c) => c[0])).toEqual(['media', 'documents']);
    expect(group.files.size).toBe(0);
  });

  it('tells the person about a share it can’t send, instead of dropping it quietly', async () => {
    const tooLong = 'a'.repeat(4001);
    const group = memoryGroup({
      [`${dir}${opA}.json`]: draft(opA, 'f_lot', { text: tooLong }),
      [`${dir}junk.json`]: 'not json',
    });
    const refused: number[] = [];
    const { send, calls } = sender();
    await drainShares(
      group,
      send,
      () => undefined,
      (count) => refused.push(count),
    );
    expect(refused).toEqual([2]);
    expect(calls).toEqual([]);
    expect(group.files.size).toBe(0);
    expect(await pendingDrafts(group)).toEqual([]);
  });
});
