import { describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '../../data/api-client';
import { ReadUrls } from './read-urls';
import { photoSize } from './sizing';
import {
  isSlow,
  keepSamples,
  partRange,
  partsSentBytes,
  retryDelayMs,
  type Sample,
  type UploadTarget,
} from './upload-model';

describe('photo sizes', () => {
  it('brings the long side down to 2048 and keeps the shape', () => {
    expect(photoSize(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536, resized: true });
    expect(photoSize(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048, resized: true });
    expect(photoSize(1200, 800, 2048)).toEqual({ width: 1200, height: 800, resized: false });
    expect(photoSize(4000, 4000, 1600)).toEqual({ width: 1600, height: 1600, resized: true });
  });
});

describe('parts', () => {
  const PART = 10 * 1024 * 1024;
  const target: UploadTarget = {
    upload: 'multipart',
    key: 'farm/f/00000000-0000-4000-8000-000000000000',
    uploadId: 'u',
    partBytes: PART,
    parts: [1, 2, 3].map((part) => ({ part, url: `https://r2/${part}` })),
    expiresAt: 0,
    etags: { 1: 'a', 3: 'c' },
  };
  it('cuts the last part short and counts what is up', () => {
    const bytes = 2 * PART + 123;
    expect(partRange(bytes, PART, 3)).toEqual({ offset: 2 * PART, length: 123 });
    expect(partsSentBytes(target, bytes)).toBe(PART + 123);
  });
});

describe('back-off', () => {
  it('waits longer after each failure, never more than five minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(retryDelayMs)).toEqual([
      2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000,
    ]);
  });
});

describe('a thin signal', () => {
  const run = (rate: number, seconds: number): Sample[] => {
    let samples: Sample[] = [];
    for (let s = 0; s <= seconds; s++)
      samples = keepSamples(samples, { at: s * 1000, sent: s * rate });
    return samples;
  };
  it('is under 48 KB/s over the last five seconds, once a transfer has run that long', () => {
    expect(isSlow(run(20_000, 8), 8000)).toBe(true);
    expect(isSlow(run(200_000, 8), 8000)).toBe(false);
    expect(isSlow(run(20_000, 3), 3000)).toBe(false);
    expect(run(20_000, 60).length).toBeLessThanOrEqual(7);
  });
});

describe('read URLs', () => {
  const answer = (keys: readonly string[], expiresAt: number) => ({
    urls: keys
      .filter((k) => !k.endsWith('gone'))
      .map((key) => ({ key, url: `https://m/${key}`, expiresAt })),
  });

  it('asks for the keys of one moment together and reuses a URL while it lasts', async () => {
    jest.useFakeTimers();
    const asked: (readonly string[])[] = [];
    let now = 1_000_000;
    const reads = new ReadUrls(
      {
        readUrls: (keys) => {
          asked.push(keys);
          return Promise.resolve(answer(keys, now + 30 * 60_000));
        },
      },
      () => now,
    );
    const got = Promise.all([reads.get('a'), reads.get('b'), reads.get('gone')]);
    await jest.advanceTimersByTimeAsync(20);
    expect(await got).toEqual(['https://m/a', 'https://m/b', null]);
    expect(asked).toEqual([['a', 'b', 'gone']]);
    expect(await reads.get('a')).toBe('https://m/a');
    // Close to its expiry, a URL is asked for again.
    now += 29 * 60_000;
    const again = reads.get('a');
    await jest.advanceTimersByTimeAsync(20);
    expect(await again).toBe('https://m/a');
    expect(asked).toHaveLength(2);
    jest.useRealTimers();
  });

  it('answers null when the API can’t be reached, and asks again later', async () => {
    jest.useFakeTimers();
    let now = 0;
    let fail = true;
    const reads = new ReadUrls(
      {
        readUrls: (keys) =>
          fail
            ? Promise.reject(new ApiError(503, 'unavailable'))
            : Promise.resolve(answer(keys, 9e9)),
      },
      () => now,
    );
    const first = reads.get('a');
    await jest.advanceTimersByTimeAsync(20);
    expect(await first).toBeNull();
    fail = false;
    expect(await reads.get('a')).toBeNull();
    now += 11_000;
    const later = reads.get('a');
    await jest.advanceTimersByTimeAsync(20);
    expect(await later).toBe('https://m/a');
    jest.useRealTimers();
  });
});
