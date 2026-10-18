import { describe, expect, it } from '@jest/globals';

import { webpLossless, webpLossy, webpLossyB } from './fixtures.test-data';
import { assembleAnimatedWebp, readWebp } from './webp';

describe('animated WebP', () => {
  it('reads still WebPs, lossy with alpha and lossless', () => {
    expect(readWebp(webpLossy)).toMatchObject({
      width: 6,
      height: 4,
      animated: false,
      hasAlpha: true,
    });
    expect(readWebp(webpLossless)).toMatchObject({ width: 6, height: 4, animated: false });
  });

  it('wraps stills as frames at even offsets', () => {
    const anim = assembleAnimatedWebp({ width: 8, height: 8, loops: 0 }, [
      { webp: webpLossy, x: 0, y: 0, durationMs: 33 },
      { webp: webpLossyB, x: 2, y: 4, durationMs: 34 },
      { webp: webpLossless, x: 2, y: 2, durationMs: 33 },
    ]);
    const info = readWebp(anim);
    expect(info).toMatchObject({ width: 8, height: 8, animated: true, hasAlpha: true, loops: 0 });
    expect(info.frames).toEqual([
      { x: 0, y: 0, w: 6, h: 4, durationMs: 33 },
      { x: 2, y: 4, w: 4, h: 2, durationMs: 34 },
      { x: 2, y: 2, w: 6, h: 4, durationMs: 33 },
    ]);
    expect(info.byteLength).toBe(anim.length);
  });

  it('refuses odd offsets and frames off the canvas', () => {
    expect(() =>
      assembleAnimatedWebp({ width: 8, height: 8, loops: 0 }, [
        { webp: webpLossy, x: 1, y: 0, durationMs: 33 },
      ]),
    ).toThrow('odd');
    expect(() =>
      assembleAnimatedWebp({ width: 6, height: 4, loops: 0 }, [
        { webp: webpLossy, x: 2, y: 0, durationMs: 33 },
      ]),
    ).toThrow('outside');
  });

  it('refuses an animated WebP as a frame', () => {
    const anim = assembleAnimatedWebp({ width: 6, height: 4, loops: 0 }, [
      { webp: webpLossy, x: 0, y: 0, durationMs: 33 },
    ]);
    expect(() =>
      assembleAnimatedWebp({ width: 6, height: 4, loops: 0 }, [
        { webp: anim, x: 0, y: 0, durationMs: 33 },
      ]),
    ).toThrow('still');
  });
});
