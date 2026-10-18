import { describe, expect, it } from 'vitest';

import { readApng } from '../../../apps/mobile/src/features/stickers/formats/apng';
import { readWebp } from '../../../apps/mobile/src/features/stickers/formats/webp';
import { durations, encodeApng, encodeWebp, everyNth } from './encode';
import type { Loop } from './render';

/** A dot moving across a transparent square: premultiplied RGBA frames. */
function movingDot(size: number, count: number): Loop {
  const frames = Array.from({ length: count }, (_, i) => {
    const rgba = new Uint8Array(size * size * 4);
    for (let y = 10; y < 20; y++) {
      for (let x = 10 + i * 2; x < 20 + i * 2; x++)
        rgba.set([200, 40, 40, 255], (y * size + x) * 4);
    }
    return { rgba, width: size, height: size };
  });
  return { frames, fps: 30 };
}

describe('frame timing', () => {
  it('rounds each frame so the loop lasts exactly its length', () => {
    const d = durations(60, 30);
    expect(d.reduce((a, b) => a + b, 0)).toBe(2000);
    expect(new Set(d)).toEqual(new Set([33, 34]));
    expect(durations(15, 15).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('halves the rate by keeping every other frame', () => {
    const l = everyNth(movingDot(32, 6), 2);
    expect(l.frames).toHaveLength(3);
    expect(l.fps).toBe(15);
  });
});

describe('encoders', () => {
  it('writes an animated WebP of only what changed, held when nothing does', async () => {
    const loop = movingDot(64, 4);
    const still = { ...loop, frames: [...loop.frames, loop.frames[3]!] };
    const info = readWebp(await encodeWebp(still, { quality: 80, alphaQuality: 90 }));
    expect(info).toMatchObject({ width: 64, height: 64, animated: true, hasAlpha: true });
    expect(info.frames).toHaveLength(4);
    expect(info.frames[1]!.w).toBeLessThan(64);
    expect(info.frames.reduce((a, f) => a + f.durationMs, 0)).toBe(167);
  });

  it('writes an APNG with one palette and cropped frames', async () => {
    const info = readApng(await encodeApng(movingDot(64, 4)));
    expect(info).toMatchObject({ width: 64, height: 64, animated: true });
    expect(info.frames).toHaveLength(4);
    expect(info.frames[1]!.w).toBeLessThan(64);
  });
});
