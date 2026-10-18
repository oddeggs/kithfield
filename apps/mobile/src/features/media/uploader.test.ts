import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '../../data/api-client';
import {
  type FakeDisk,
  type FakeServer,
  MB,
  type MemoryStore,
  PART,
  type Sent,
  settle,
  World,
} from './queue-fakes.test-data';
import type { LocalMedia } from './upload-model';

let world: World;
let server: FakeServer;
let disk: FakeDisk;
let store: MemoryStore;
let sent: Sent[];
const uploader = () => world.uploader();
const photo = (name: string, bytes?: number) => world.photo(name, bytes);

beforeEach(() => {
  jest.useFakeTimers();
  world = new World();
  ({ server, disk, store, sent } = world);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('the upload queue', () => {
  it('uploads a message’s photos, then sends the media command with their keys', async () => {
    const q = uploader();
    await q.enqueue('farm1', { command: 'media', caption: 'the river ones' }, [
      photo('a.jpg'),
      photo('b.jpg', 200_000),
    ]);
    await settle();
    expect(server.asked.map((r) => r.kind)).toEqual(['photo', 'photo']);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      farm: 'farm1',
      kind: 'media',
      payload: {
        caption: 'the river ones',
        items: [
          { mime: 'image/jpeg', bytes: 300_000, width: 2048, height: 1536 },
          { bytes: 200_000 },
        ],
      },
    });
    const [batch] = q.getSnapshot();
    expect(batch?.phase).toBe('sent');
    expect(store.saved[0]?.phase).toBe('sent');
    const key = batch?.items[0]?.key ?? '';
    expect(q.localUriFor(key)).toBe('file://a.jpg');
  });

  it('sends a voice note as the voice command with its length and levels', async () => {
    const q = uploader();
    disk.files.set('file://v.m4a', 40_000);
    await q.enqueue(
      'farm1',
      { command: 'voice', durationMs: 4200.4, waveform: [0, 300, -2, 128] },
      [{ uri: 'file://v.m4a', kind: 'voice', mime: 'audio/mp4', bytes: 40_000, durationMs: 4200 }],
    );
    await settle();
    expect(sent[0]).toMatchObject({
      kind: 'voice',
      payload: { durationMs: 4200, waveform: [0, 255, 0, 128], audio: { mime: 'audio/mp4' } },
    });
  });

  it('retries a dropped PUT with back-off, and asks again for a URL R2 refused', async () => {
    const q = uploader();
    server.script = [
      { match: /r2/, answer: 'drop' },
      { match: /r2/, answer: 'refuse' },
    ];
    await q.enqueue('farm1', { command: 'media' }, [photo('a.jpg')]);
    await settle();
    expect(sent).toHaveLength(0);
    expect(q.getSnapshot()[0]?.items[0]).toMatchObject({ phase: 'waiting', attempts: 1 });
    await settle(2_000);
    // The refused PUT: the next try starts with a fresh URL.
    expect(server.asked).toHaveLength(1);
    await settle(5_000);
    expect(server.asked).toHaveLength(2);
    expect(sent).toHaveLength(1);
  });

  it('resumes a multipart upload after the app was closed, without resending parts', async () => {
    const big = 55 * MB;
    disk.files.set('file://big.mov', big);
    const media: LocalMedia = {
      uri: 'file://big.mov',
      kind: 'video',
      mime: 'video/mp4',
      bytes: big,
    };
    server.script = [{ match: /part=4/, answer: 'hang' }];
    const first = uploader();
    await first.enqueue('farm1', { command: 'media' }, [media]);
    await settle();
    expect(server.puts.map((u) => new URL(u).searchParams.get('part'))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(store.saved[0]?.items[0]?.sentBytes).toBe(3 * PART);

    // The app is closed mid-part and opened again: a new queue from what was saved.
    server.puts = [];
    const second = uploader();
    await second.start();
    await settle();
    expect(server.puts.map((u) => new URL(u).searchParams.get('part'))).toEqual(['4', '5', '6']);
    expect(server.asked).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect([...server.objects.values()]).toEqual([6]);
    // Part files are cleaned up as they go.
    expect([...disk.files.keys()].filter((uri) => uri.includes('#'))).toEqual([]);
  });

  it('stops an item that can never go, and sends the rest once it is taken out', async () => {
    const q = uploader();
    await q.enqueue('farm1', { command: 'media' }, [photo('ok.jpg')]);
    await settle();
    server.refuseUploadUrl = new ApiError(413, 'too_large');
    const id = await q.enqueue('farm1', { command: 'media' }, [photo('a.jpg'), photo('b.jpg')]);
    await settle();
    const batch = q.getSnapshot().find((b) => b.id === id);
    expect(batch?.items.map((i) => i.failure)).toEqual(['too_large', 'too_large']);
    server.refuseUploadUrl = null;
    q.retry(id);
    await settle();
    expect(sent).toHaveLength(2);
  });

  it('drops a cancelled item and its file; a message with nothing left goes away', async () => {
    const q = uploader();
    server.script = [
      { match: /r2/, answer: 'hang' },
      { match: /r2/, answer: 'hang' },
    ];
    const id = await q.enqueue('farm1', { command: 'media' }, [photo('a.jpg'), photo('b.jpg')]);
    await settle();
    const [a, b] = q.getSnapshot()[0]?.items ?? [];
    q.cancel(id, a?.id);
    expect(disk.files.has('file://a.jpg')).toBe(false);
    q.cancel(id, b?.id);
    expect(q.getSnapshot()).toEqual([]);
    await settle();
    expect(sent).toEqual([]);
  });

  it('sends smaller copies of photos still going up', async () => {
    const q = uploader();
    server.script = [{ match: /r2/, answer: 'hang' }];
    const id = await q.enqueue('farm1', { command: 'media' }, [photo('a.jpg', 4_000_000)]);
    await settle();
    await q.sendSmaller(id);
    await settle();
    expect(server.asked.map((r) => r.bytes)).toEqual([4_000_000, 2_000_000]);
    expect(sent[0]).toMatchObject({ payload: { items: [{ bytes: 2_000_000, width: 1600 }] } });
  });

  it('fails an item whose file is gone from the phone', async () => {
    const q = uploader();
    const media = photo('a.jpg');
    disk.files.delete(media.uri);
    await q.enqueue('farm1', { command: 'media' }, [media]);
    await settle();
    expect(q.getSnapshot()[0]?.items[0]?.failure).toBe('unreadable');
    expect(server.asked).toEqual([]);
  });
});

describe('a single PUT', () => {
  it('asks R2 to create only, and takes “already there” as done', async () => {
    const q = uploader();
    server.script = [{ match: /r2/, answer: 'exists' }];
    await q.enqueue('farm1', { command: 'media' }, [photo('a.jpg')]);
    await settle();
    expect(server.headers[0]).toMatchObject({ 'content-type': 'image/jpeg', 'if-none-match': '*' });
    expect(sent).toHaveLength(1);
  });
});

describe('sending the message', () => {
  it('keeps the op id with the message before sending, so a send cut short repeats it', async () => {
    const first = uploader();
    world.hangSends = true;
    await first.enqueue('farm1', { command: 'media' }, [photo('a.jpg')]);
    await settle();
    // The app is killed in the middle of the send: whether it reached the outbox is unknown.
    expect(sent).toHaveLength(1);
    const opId = sent[0]?.opId;
    expect(store.saved[0]).toMatchObject({ phase: 'uploading', opId });

    // The next launch sends it again with the same op id, which the farm applies once.
    world.hangSends = false;
    const second = uploader();
    await second.start();
    await settle();
    expect(sent.map((s) => s.opId)).toEqual([opId, opId]);
    expect(store.saved[0]).toMatchObject({ phase: 'sent', opId });
  });
});

describe('signing out', () => {
  it('stops at a 401 instead of retrying', async () => {
    const q = uploader();
    server.refuseUploadUrl = new ApiError(401, 'unauthorized');
    await q.enqueue('farm1', { command: 'media' }, [photo('a.jpg')]);
    await settle(10 * 60_000);
    expect(server.asked).toHaveLength(1);
    expect(q.getSnapshot()[0]?.items[0]?.failure).toBe('signed_out');
  });

  it('clears the queue and its files, and counts what was still unsent', async () => {
    const q = uploader();
    server.script = [
      { match: /r2/, answer: 'hang' },
      { match: /r2/, answer: 'hang' },
    ];
    await q.enqueue('farm1', { command: 'media' }, [photo('a.jpg')]);
    await q.enqueue('farm1', { command: 'media' }, [photo('b.jpg')]);
    await settle();
    expect(q.pendingCount()).toBe(2);
    await q.clear();
    expect(q.getSnapshot()).toEqual([]);
    expect(q.pendingCount()).toBe(0);
    expect(store.saved).toEqual([]);
    expect(disk.files.has('file://a.jpg')).toBe(false);
  });
});

describe('cancelling', () => {
  it('aborts the item’s upload on the server too', async () => {
    const q = uploader();
    const big = 55 * MB;
    disk.files.set('file://big.mov', big);
    server.script = [{ match: /part=2/, answer: 'hang' }];
    const id = await q.enqueue('farm1', { command: 'media' }, [
      { uri: 'file://big.mov', kind: 'video', mime: 'video/mp4', bytes: big },
    ]);
    await settle();
    const item = q.getSnapshot()[0]?.items[0];
    q.cancel(id, item?.id);
    await settle();
    expect(server.aborted).toEqual([
      { key: expect.stringMatching(/^farm\/farm1\//), uploadId: expect.stringMatching(/^up/) },
    ]);
  });
});

describe('failed messages', () => {
  it('are let go a week after they failed, with their files', async () => {
    const q = uploader();
    server.refuseUploadUrl = new ApiError(413, 'too_large');
    await q.enqueue('farm1', { command: 'media' }, [photo('a.jpg')]);
    await settle();
    expect(q.getSnapshot()).toHaveLength(1);
    await settle(8 * 24 * 60 * 60_000);
    // Anything that wakes the queue lets the old failure go.
    await q.enqueue('farm1', { command: 'media' }, [photo('b.jpg')]);
    await settle();
    expect(q.getSnapshot().map((b) => b.items[0]?.uri)).toEqual(['file://b.jpg']);
    expect(disk.files.has('file://a.jpg')).toBe(false);
  });
});
