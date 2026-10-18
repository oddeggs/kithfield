import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { decodePng, pixelDrift } from '../src/png';

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, body, Buffer.alloc(4)]);
}

/** A 2×3 RGB PNG whose rows use the given filters (the decoder ignores CRCs). */
function png(rows: number[][], filters: number[]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(rows.length, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = rows.flatMap((row, y) => [filters[y] ?? 0, ...row]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', new Uint8Array()),
  ]);
}

describe('png decoding', () => {
  it('reads unfiltered rows', () => {
    const image = decodePng(png([[1, 2, 3, 4, 5, 6]], [0]));
    expect(image).toMatchObject({ width: 2, height: 1, channels: 3 });
    expect([...image.data]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('undoes the sub, up, average and paeth filters', () => {
    const image = decodePng(
      png(
        [
          [10, 20, 30, 1, 1, 1],
          [5, 5, 5, 5, 5, 5],
          [0, 0, 0, 2, 2, 2],
          [1, 1, 1, 1, 1, 1],
        ],
        [1, 2, 3, 4],
      ),
    );
    expect([...image.data]).toEqual([
      // sub: each byte adds the one a pixel to the left
      10, 20, 30, 11, 21, 31,
      // up: adds the row above
      15, 25, 35, 16, 26, 36,
      // average of left and up
      7, 12, 17, 13, 21, 28,
      // paeth: the left, up or up-left byte nearest to left + up - up-left
      8, 13, 18, 14, 22, 29,
    ]);
  });
});

describe('pixel drift', () => {
  const base = { width: 2, height: 2, channels: 3, data: new Uint8Array(12).fill(100) };

  it('counts differing pixels and the largest channel step', () => {
    const other = { ...base, data: Uint8Array.from(base.data) };
    other.data[4] = 103;
    expect(pixelDrift(base, other)).toEqual({ differing: 1, share: 0.25, max: 3 });
    expect(pixelDrift(base, base)).toEqual({ differing: 0, share: 0, max: 0 });
  });

  it('treats a size change as a full difference', () => {
    expect(pixelDrift(base, { ...base, width: 1 }).share).toBe(1);
  });
});
