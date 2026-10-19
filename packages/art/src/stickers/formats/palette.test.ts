import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';

import { assembleApng, readApng } from './apng';
import { changedIndexRect, encodeIndexedPng } from './indexed-png';
import { buildPalette, indexer, paletteBuilder } from './palette';
import { headerOf, readChunks } from './png';

/** A frame of `w`×`h` RGBA where `paint` gives each pixel. */
function frame(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number, number],
) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) px.set(paint(x, y), (y * w + x) * 4);
  }
  return px;
}

const red: [number, number, number, number] = [220, 40, 40, 255];
const ink: [number, number, number, number] = [42, 34, 29, 255];
const clear: [number, number, number, number] = [0, 0, 0, 0];

describe('a sticker’s palette', () => {
  it('keeps index 0 clear and finds the colours that are there', () => {
    const a = frame(8, 8, (x) => (x < 2 ? clear : x < 5 ? red : ink));
    const palette = buildPalette([a]);
    expect(palette.colours[3]).toBe(0);
    const idx = indexer(palette)(a);
    expect(idx[0]).toBe(0);
    const colourOf = (i: number) => Array.from(palette.colours.subarray(i * 4, i * 4 + 4));
    expect(colourOf(idx[3] ?? 0)).toEqual(red);
    expect(colourOf(idx[7] ?? 0)).toEqual(ink);
  });

  it('comes out the same built a frame at a time', () => {
    const a = frame(16, 16, (x, y) => [(x * 16) % 256, (y * 16) % 256, 90, 255]);
    const b = frame(16, 16, (x) => (x < 8 ? clear : ink));
    const builder = paletteBuilder();
    builder.add(a);
    builder.add(b);
    expect(builder.build(32)).toEqual(buildPalette([a, b], 32));
  });

  it('never holds more colours than asked', () => {
    const noisy = frame(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, (x * y) % 256, 255]);
    expect(buildPalette([noisy], 16).size).toBeLessThanOrEqual(16);
  });
});

describe('palette PNG frames', () => {
  it('writes a valid palette PNG of just the changed rectangle', () => {
    const a = frame(10, 6, () => red);
    const b = frame(10, 6, (x, y) => (x >= 4 && x < 7 && y >= 2 && y < 4 ? ink : red));
    const palette = buildPalette([a, b]);
    const map = indexer(palette);
    const [ia, ib] = [map(a), map(b)];
    const rect = changedIndexRect(ia, ib, 10, 6);
    expect(rect).toEqual({ x: 4, y: 2, w: 3, h: 2 });
    expect(changedIndexRect(ia, ia, 10, 6)).toBeNull();
    if (!rect) return;
    const png = encodeIndexedPng(ib, 10, palette, rect);
    const chunks = readChunks(png);
    expect(headerOf(chunks)).toEqual({ width: 3, height: 2, bitDepth: 8, colorType: 3 });
    const raw = unzlibSync(chunks.find((c) => c.type === 'IDAT')?.data ?? new Uint8Array());
    expect(raw).toHaveLength((3 + 1) * 2);
    expect(raw[0]).toBe(0);

    const anim = assembleApng({ width: 10, height: 6, loops: 0 }, [
      {
        png: encodeIndexedPng(ia, 10, palette, { x: 0, y: 0, w: 10, h: 6 }),
        x: 0,
        y: 0,
        delayMs: 83,
      },
      { png, x: rect.x, y: rect.y, delayMs: 83 },
    ]);
    const info = readApng(anim);
    expect(info.frames.map((f) => [f.x, f.y, f.w, f.h])).toEqual([
      [0, 0, 10, 6],
      [4, 2, 3, 2],
    ]);
  });
});
