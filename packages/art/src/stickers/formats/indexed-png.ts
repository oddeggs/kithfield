import { zlibSync } from 'fflate';

import { concat, putU32be } from './bytes';
import type { Rect } from './delta';
import type { Palette } from './palette';
import { PNG_SIGNATURE, writeChunk } from './png';

/*
 * Palette PNGs (colour type 3, 8 bits) from palette indexes: what keeps an animated sticker under
 * the 500 KB Messages takes, where full-colour frames would be several times that.
 */

/** The smallest rectangle where two index frames differ, or null when they are the same. */
export function changedIndexRect(
  prev: Uint8Array,
  next: Uint8Array,
  width: number,
  height: number,
): Rect | null {
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if (prev[row + x] !== next[row + x]) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first < 0) continue;
    if (top < 0) top = y;
    bottom = y;
    if (first < left) left = first;
    if (last > right) right = last;
  }
  if (top < 0) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** A rectangle of an index frame as a palette PNG with the shared palette. */
export function encodeIndexedPng(
  indexes: Uint8Array,
  width: number,
  palette: Palette,
  rect: Rect,
): Uint8Array {
  const raw = new Uint8Array((rect.w + 1) * rect.h);
  for (let y = 0; y < rect.h; y++) {
    const from = (rect.y + y) * width + rect.x;
    // Filter type 0 (none) leads each row: indexes compress best unfiltered.
    raw.set(indexes.subarray(from, from + rect.w), y * (rect.w + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  putU32be(ihdr, 0, rect.w);
  putU32be(ihdr, 4, rect.h);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = new Uint8Array(palette.size * 3);
  const trns = new Uint8Array(palette.size);
  for (let i = 0; i < palette.size; i++) {
    plte[i * 3] = palette.colours[i * 4] ?? 0;
    plte[i * 3 + 1] = palette.colours[i * 4 + 1] ?? 0;
    plte[i * 3 + 2] = palette.colours[i * 4 + 2] ?? 0;
    trns[i] = palette.colours[i * 4 + 3] ?? 0;
  }
  return concat([
    PNG_SIGNATURE,
    writeChunk('IHDR', ihdr),
    writeChunk('PLTE', plte),
    writeChunk('tRNS', trns),
    writeChunk('IDAT', zlibSync(raw, { level: 9 })),
    writeChunk('IEND', new Uint8Array(0)),
  ]);
}
