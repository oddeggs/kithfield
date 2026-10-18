import { jest } from '@jest/globals';
import {
  type AbortUploadRequest,
  LIMITS,
  type UploadUrlRequest,
  type UploadUrlResponse,
} from '@kithfield/contracts';

import { ApiError } from '../../data/api-client';
import type { MediaApi } from './media-api';
import type { PutOptions, Transport } from './transport';
import type { LocalMedia, UploadBatch } from './upload-model';
import type { UploadStore } from './upload-store';
import { Uploader } from './uploader';

/*
 * The queue's world in tests: a stand-in of the two network edges (the API and R2) and the disk.
 * The stand-ins keep what a real server would: objects, parts and their ETags.
 */

export const PART = 10 * 1024 * 1024;
export const MB = 1024 * 1024;

type PutAnswer = 'ok' | 'refuse' | 'drop' | 'hang' | 'exists';

export class FakeServer {
  objects = new Map<string, number>();
  parts = new Map<string, Map<number, string>>();
  puts: string[] = [];
  /** The headers each PUT carried, in order. */
  headers: Readonly<Record<string, string>>[] = [];
  asked: UploadUrlRequest[] = [];
  aborted: AbortUploadRequest[] = [];
  /** What the next PUTs to URLs matching a pattern answer, in order. */
  script: { match: RegExp; answer: PutAnswer }[] = [];
  refuseUploadUrl: ApiError | null = null;
  private n = 0;

  readonly api: Pick<MediaApi, 'uploadUrl' | 'complete' | 'abort'> = {
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
    abort: (req) => {
      this.aborted.push(req);
      return Promise.resolve(null);
    },
  };

  put(url: string, bytes: number, options: PutOptions) {
    this.puts.push(url);
    this.headers.push(options.headers);
    const step = this.script.findIndex((s) => s.match.test(url));
    const answer = step >= 0 ? (this.script.splice(step, 1)[0]?.answer ?? 'ok') : 'ok';
    if (answer === 'hang') {
      return new Promise<never>((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    }
    if (answer === 'drop') return Promise.reject(new Error('the network went'));
    if (answer === 'refuse') return Promise.resolve({ status: 403, etag: null });
    if (answer === 'exists') return Promise.resolve({ status: 412, etag: null });
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
export class FakeDisk implements Transport {
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

export class MemoryStore implements UploadStore {
  saved: UploadBatch[] = [];
  load() {
    return Promise.resolve(structuredClone(this.saved));
  }
  save(batches: readonly UploadBatch[]) {
    this.saved = structuredClone([...batches]);
    return Promise.resolve();
  }
}

export interface Sent {
  readonly farm: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly opId: string;
}

/** One phone's queue and the servers it talks to. */
export class World {
  server = new FakeServer();
  disk = new FakeDisk(this.server);
  store = new MemoryStore();
  sent: Sent[] = [];
  /** Sends that never answer, as when the app is killed in the middle of one. */
  hangSends = false;
  private ids = 0;
  private ops = 0;

  uploader(): Uploader {
    return new Uploader({
      api: this.server.api,
      transport: this.disk,
      store: this.store,
      now: () => Date.now(),
      newId: () => `id${++this.ids}`,
      newOpId: () => `0190a0b0-0000-7000-8000-${String(++this.ops).padStart(12, '0')}`,
      sendCommand: (farm, kind, payload, opId) => {
        this.sent.push({ farm, kind, payload, opId });
        if (this.hangSends) return new Promise<never>(() => undefined);
        return Promise.resolve({ status: 'queued', opId });
      },
      shrink: (item, longSide) => {
        const uri = `${item.uri}@${longSide}`;
        this.disk.files.set(uri, Math.floor(item.bytes / 2));
        return Promise.resolve({
          ...item,
          uri,
          bytes: Math.floor(item.bytes / 2),
          width: longSide,
        });
      },
    });
  }

  photo(name: string, bytes = 300_000): LocalMedia {
    this.disk.files.set(`file://${name}`, bytes);
    return {
      uri: `file://${name}`,
      kind: 'photo',
      mime: 'image/jpeg',
      bytes,
      width: 2048,
      height: 1536,
    };
  }
}

/** Lets every pending promise and due timer run. */
export const settle = async (ms = 0) => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(i === 0 ? ms : 0);
};
