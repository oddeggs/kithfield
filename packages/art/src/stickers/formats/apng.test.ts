import { describe, expect, it } from 'vitest';

import { assembleApng, readApng } from './apng';
import { pngA, pngB } from './fixtures.test-data';
import { readChunks } from './png';

describe('APNG', () => {
  it('stitches a full first frame and a smaller second one', () => {
    const apng = assembleApng({ width: 6, height: 4, loops: 0 }, [
      { png: pngA, x: 0, y: 0, delayMs: 33 },
      { png: pngB, x: 2, y: 2, delayMs: 50 },
    ]);
    const info = readApng(apng);
    expect(info).toMatchObject({ width: 6, height: 4, animated: true, loops: 0 });
    expect(info.frames).toEqual([
      { x: 0, y: 0, w: 6, h: 4, delayMs: 33 },
      { x: 2, y: 2, w: 4, h: 2, delayMs: 50 },
    ]);
    const types = readChunks(apng).map((c) => c.type);
    expect(types.slice(0, 2)).toEqual(['IHDR', 'acTL']);
    expect(types).toContain('fdAT');
    expect(types[types.length - 1]).toBe('IEND');
  });

  it('reads a plain PNG as one still frame', () => {
    expect(readApng(pngA)).toMatchObject({ animated: false, width: 6, height: 4 });
  });

  it('refuses a first frame smaller than the canvas, and frames off the canvas', () => {
    expect(() =>
      assembleApng({ width: 6, height: 4, loops: 0 }, [{ png: pngB, x: 0, y: 0, delayMs: 33 }]),
    ).toThrow('whole canvas');
    expect(() =>
      assembleApng({ width: 6, height: 4, loops: 0 }, [
        { png: pngA, x: 0, y: 0, delayMs: 33 },
        { png: pngB, x: 4, y: 0, delayMs: 33 },
      ]),
    ).toThrow('outside');
  });

  it('notices a corrupted chunk', () => {
    const apng = assembleApng({ width: 6, height: 4, loops: 1 }, [
      { png: pngA, x: 0, y: 0, delayMs: 33 },
    ]);
    const bad = apng.slice();
    bad[40] = (bad[40] ?? 0) ^ 0xff;
    expect(() => readApng(bad)).toThrow();
  });
});
