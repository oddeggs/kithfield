import { describe, expect, it } from 'vitest';

import { captureScale, sliceRects } from './fit';
import { SLOTS, fitsSlot } from './limits';
import { BOARD_JOBS, CLIP_JOBS } from './specs';

describe('cutting a board box to store sizes', () => {
  it('scales a six-frame panorama so every frame covers a 6.9" screenshot', () => {
    const scale = captureScale([2040, 737], 6, [1320, 2868]);
    const captured = [Math.round(2040 * scale), Math.round(737 * scale)] as const;
    const rects = sliceRects(captured, 6, [1320, 2868]);
    expect(rects).toHaveLength(6);
    for (const rect of rects) {
      expect([rect.width, rect.height]).toEqual([1320, 2868]);
      expect(rect.left + rect.width).toBeLessThanOrEqual(captured[0]);
      expect(rect.top + rect.height).toBeLessThanOrEqual(captured[1]);
    }
    // Panels sit side by side in order, a frame's width apart.
    const lefts = rects.map((r) => r.left);
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    expect((lefts[5] ?? 0) - (lefts[0] ?? 0)).toBeCloseTo((captured[0] / 6) * 5, -1);
  });

  it('refuses a capture too small for its panels', () => {
    expect(() => sliceRects([1000, 2000], 1, [1320, 2868])).toThrow();
  });

  it('gives every board job and clip a size its store slot accepts, and one file per panel', () => {
    for (const job of [...BOARD_JOBS, ...CLIP_JOBS]) {
      expect({ id: job.id, fits: fitsSlot(SLOTS[job.slot], job.size) }).toEqual({
        id: job.id,
        fits: null,
      });
    }
    for (const job of BOARD_JOBS) expect(job.files).toHaveLength(job.slices);
    const files = BOARD_JOBS.flatMap((job) => job.files);
    expect(new Set(files).size).toBe(files.length);
  });

  it('keeps each locale within the stores’ screenshot counts', () => {
    const count = (prefix: string) =>
      BOARD_JOBS.filter((job) => job.id.startsWith(prefix)).reduce((n, job) => n + job.slices, 0);
    expect(count('ios.en.iphone-6.9')).toBeLessThanOrEqual(SLOTS.iphone69.perLocale * 2);
    expect(count('android.en.phone')).toBeLessThanOrEqual(SLOTS.playPhone.perLocale);
  });

  it('keeps the App Preview between 15 and 30 seconds', () => {
    for (const clip of CLIP_JOBS.filter((c) => c.slot === 'appPreview69')) {
      const seconds = clip.shots.reduce((n, s) => n + s.seconds, 0);
      expect(seconds).toBeGreaterThanOrEqual(15);
      expect(seconds).toBeLessThan(30);
    }
  });
});

describe('store slots', () => {
  it('accepts either orientation of an exact size', () => {
    expect(fitsSlot(SLOTS.ipad13, [2752, 2064])).toBeNull();
    expect(fitsSlot(SLOTS.ipad13, [2064, 2752])).toBeNull();
    expect(fitsSlot(SLOTS.iphone69, [1290, 2796])).toBeNull();
    expect(fitsSlot(SLOTS.iphone69, [1284, 2778])).not.toBeNull();
  });

  it('holds Play screenshots to 2:1 at most', () => {
    expect(fitsSlot(SLOTS.playPhone, [1080, 2160])).toBeNull();
    expect(fitsSlot(SLOTS.playPhone, [1080, 2400])).not.toBeNull();
  });

  it('wants review screenshots of at least 640 × 920', () => {
    expect(fitsSlot(SLOTS.iapReview, [1179, 2556])).toBeNull();
    expect(fitsSlot(SLOTS.iapReview, [600, 900])).not.toBeNull();
  });
});
