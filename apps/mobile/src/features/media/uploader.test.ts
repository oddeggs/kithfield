import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LIMITS, type UploadUrlRequest, type UploadUrlResponse } from '@kithfield/contracts';

import { ApiError } from '../../data/api-client';
import type { MediaApi } from './media-api';
import type { PutOptions, Transport } from './transport';
import type { LocalMedia, UploadBatch } from './upload-model';
import type { UploadStore } from './upload-store';
import { Uploader } from './uploader';

/*
 * The queue against a stand-in of the two network edges (the API and R2) and the disk. The
 * stand-ins keep what a real server would: objects, parts and their ETags.
 */

const PART = 10 * 1024 * 1024;
const MB = 1024 * 1024;

type PutAnswer = 'ok' | 'refuse' | 'drop' | 'hang';

class FakeServer {
  objects = new Map<string, number>();
  parts = new Map<string, Map<number, string>>();
  puts: string[] = [];
  asked: UploadUrlRequest[] = [];
  /** What the next PUTs to URLs matching a pattern answer, in order. */
  script: { match: RegExp; answer: PutAnswer }[] = [];
  refuseUploadUrl: ApiError | null = null;
  private n = 0;

  readonly api: Pick<MediaApi, 'uploadUrl' | 'complete'> = {
    uploadUrl: (req) => {
      this.asked.push(req);
      if (this.refuseUploadUrl) return Promise.reject(this.refuseUploadUrl);
      const key = `farm/${req.farm}/0000000${++this.n}-0000-4000-8000-000000000000`;
      const expiresAt = Date.now() + 3600_000;
      if (req.bytes <= LIMITS.multipartAboveBytes) {
        return Promise.resolve({ upload: 'single', key, url: `https://r2/${key}`, expiresAt });
      }
      const uploadId = `up${this.n}`;
      this.parts.set(uploadId, new Map());
      const count = Math.ceil(req.bytes / PART);
      const parts = Array.from({ length: count }, (_, i) => ({
        part: i + 1,
        url: `https://r2/${key}?uploadId=${uploadId}&part=${i + 1}`,
      }));
      return Promise.resolve({
        upload: 'multipart',
        key,
        uploadId,
        partBytes: PART,
        parts,
        expiresAt,
      } satisfies UploadUrlResponse);
    },
    complete: ({ key, uploadId, parts }) => {
      const have = this.parts.get(uploadId);
      if (have === undefined || parts.some((p) => have.get(p.part) !== p.etag)) {
        return Promise.reject(new ApiError(409, 'conflict'));
      }
      this.objects.set(key, parts.length);
      return Promise.resolve({ key });
    },
  };

  put(url: string, bytes: number, options: PutOptions) {
    this.puts.push(url);
    const step = this.script.findIndex((s) => s.match.test(url));
    const answer = step >= 0 ? (this.script.splice(step, 1)[0]?.answer ?? 'ok') : 'ok';
    if (answer === 'hang') {
      return new Promise<never>((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    }
    if (answer === 'drop') return Promise.reject(new Error('the network went'));
    if (answer === 'refuse') return Promise.resolve({ status: 403, etag: null });
    options.onProgress(bytes);
    const query = new URL(url).searchParams;
    const uploadId = query.get('uploadId');
    if (uploadId !== null) {
      const etag = `"etag-${uploadId}-${query.get('part')}"`;
      this.parts.get(uploadId)?.set(Number(query.get('part')), etag);
      return Promise.resolve({ status: 200, etag });
    }
    this.objects.set(new URL(url).pathname.slice(1), bytes);
    return Promise.resolve({ status: 200, etag: '"single"' });
  }
}

/** Files by URI with their sizes; a slice is a new file of its length. */
class FakeDisk implements Transport {
  files = new Map<string, number>();
  constructor(private readonly server: FakeServer) {}
  put(url: string, uri: string, options: PutOptions) {
    return this.server.put(url, this.files.get(uri) ?? 0, options);
  }
  slice(uri: string, offset: number, length: number) {
    const part = `${uri}#${offset}`;
    this.files.set(part, length);
    return Promise.resolve(part);
  }
  size(uri: string) {
    return this.files.get(uri) ?? null;
  }
  remove(uri: string) {
    this.files.delete(uri);
  }
}

class MemoryStore implements UploadStore {
  saved: UploadBatch[] = [];
  load() {
    return Promise.resolve(structuredClone(this.saved));
  }
  save(batches: readonly UploadBatch[]) {
    this.saved = structuredClone([...batches]);
    return Promise.resolve();
  }
}

let server: FakeServer;
let disk: FakeDisk;
let store: MemoryStore;
let sent: { farm: string; kind: string; payload: unknown }[];
let ids = 0;

const uploader = () =>
  new Uploader({
    api: server.api,
    transport: disk,
    store,
    now: () => Date.now(),
    newId: () => `id${++ids}`,
    send: (farm, kind, payload) => {
      sent.push({ farm, kind, payload });
      return Promise.resolve({ status: 'queued', opId: '0190a0b0-0000-7000-8000-000000000001' });
    },
    shrink: (item, longSide) => {
      const uri = `${item.uri}@${longSide}`;
      disk.files.set(uri, Math.floor(item.bytes / 2));
      return Promise.resolve({ ...item, uri, bytes: Math.floor(item.bytes / 2), width: longSide });
    },
  });

const photo = (name: string, bytes = 300_000): LocalMedia => {
  disk.files.set(`file://${name}`, bytes);
  return {
    uri: `file://${name}`,
    kind: 'photo',
    mime: 'image/jpeg',
    bytes,
    width: 2048,
    height: 1536,
  };
};

/** Lets every pending promise and due timer run. */
const settle = async (ms = 0) => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(i === 0 ? ms : 0);
};

beforeEach(() => {
  jest.useFakeTimers();
  server = new FakeServer();
  disk = new FakeDisk(server);
  store = new MemoryStore();
  sent = [];
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
