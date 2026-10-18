import { describe, expect, it } from 'vitest';

import { changedRect, cropRgba } from './delta';

const frame = (w: number, h: number) => new Uint8Array(w * h * 4);

describe('changedRect', () => {
  it('is null for identical frames', () => {
    expect(changedRect(frame(4, 4), frame(4, 4), 4, 4)).toBeNull();
  });

  it('bounds every changed pixel, with an even corner', () => {
    const a = frame(8, 6);
    const b = frame(8, 6);
    b[(3 * 8 + 5) * 4 + 3] = 255; // (5, 3)
    b[(4 * 8 + 6) * 4] = 1; // (6, 4)
    expect(changedRect(a, b, 8, 6)).toEqual({ x: 4, y: 2, w: 3, h: 3 });
    expect(changedRect(a, b, 8, 6, 1)).toEqual({ x: 5, y: 3, w: 2, h: 2 });
  });

  it('crops a rectangle out of a frame', () => {
    const a = frame(3, 2);
    a.set([1, 2, 3, 4], (1 * 3 + 2) * 4);
    expect(Array.from(cropRgba(a, 3, { x: 2, y: 1, w: 1, h: 1 }))).toEqual([1, 2, 3, 4]);
  });

  it('refuses frames of the wrong size', () => {
    expect(() => changedRect(frame(2, 2), frame(3, 2), 2, 2)).toThrow();
  });
});
