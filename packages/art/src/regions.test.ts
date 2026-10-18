import { describe, expect, it } from 'vitest';

import { markChanges, rectangles, tileMap, type TileMap, type TileRect } from './regions';

/** A map from rows of `#` (changed) and `.`. */
const mapOf = (rows: string[], tile = 8): TileMap => {
  const map = tileMap((rows[0]?.length ?? 0) * tile, rows.length * tile, tile);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => (map.on[y * map.cols + x] = c === '#' ? 1 : 0)),
  );
  return map;
};

const covered = (map: TileMap, rects: readonly TileRect[]) => {
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      if (!map.on[y * map.cols + x]) continue;
      if (!rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) return false;
    }
  }
  return true;
};

describe('where a scene moves', () => {
  it('marks the tiles whose pixels changed, past the tolerance', () => {
    // A 4×2 image at 2× over tiles of 1 CSS pixel: 2×1 tiles.
    const map = tileMap(2, 1, 1);
    const first = new Uint32Array(8);
    const frame = first.slice();
    frame[6] = 0x01000000; // one level of alpha, in the second tile
    markChanges(map, first, frame, 4, 2, 2, 1);
    expect([...map.on]).toEqual([0, 0]);
    frame[1] = 0x00000005;
    markChanges(map, first, frame, 4, 2, 2, 1);
    expect([...map.on]).toEqual([1, 0]);
    markChanges(map, first, frame, 4, 2, 2, 0);
    expect([...map.on]).toEqual([1, 1]);
  });

  it('marks the tiles within a margin of a change', () => {
    // A 5×3 image at 1× over 1-pixel tiles, changed in the middle.
    const map = tileMap(5, 3, 1);
    const first = new Uint32Array(15);
    const frame = first.slice();
    frame[7] = 1;
    markChanges(map, first, frame, 5, 3, 1, 0, 1);
    expect([...map.on].join('')).toBe('011100111001110');
  });

  it('covers every changed tile with a few rectangles', () => {
    const map = mapOf([
      '##......##',
      '##......##',
      '..........',
      '...####...',
      '...####...',
      '....##....',
    ]);
    const rects = rectangles(map);
    expect(covered(map, rects)).toBe(true);
    expect(rects).toHaveLength(3);
    expect(rects).toContainEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(rects).toContainEqual({ x: 8, y: 0, w: 2, h: 2 });
    // The notch under the block costs two tiles: cheaper joined than as two loops.
    expect(rects).toContainEqual({ x: 3, y: 3, w: 4, h: 3 });
  });

  it('keeps far-apart parts apart', () => {
    const map = mapOf(['#........#']);
    expect(rectangles(map)).toHaveLength(2);
  });
});
