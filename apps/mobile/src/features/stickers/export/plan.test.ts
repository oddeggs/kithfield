import { describe, expect, it } from '@jest/globals';

import { bakePlan, stickerSignature } from './plan';

const sticker = (stem: string, pose: string) => ({
  id: stem,
  stem,
  label: stem,
  attrs: { kind: 'rabbit', pose, caption: stem },
});

describe('what a pack needs made again', () => {
  it('keeps every sticker already made the same way and makes the rest', () => {
    const wave = sticker('01-wave', 'wave');
    const hug = sticker('02-hug', 'hug');
    const done = { '01-wave': stickerSignature(wave, 'apng-1') };
    const plan = bakePlan([wave, hug], done, 'apng-1');
    expect(plan.reuse.map((s) => s.stem)).toEqual(['01-wave']);
    expect(plan.make.map((s) => s.stem)).toEqual(['02-hug']);
  });

  it('makes a sticker again when its drawing or the way files are made changed', () => {
    const wave = sticker('01-wave', 'wave');
    const done = { '01-wave': stickerSignature(wave, 'apng-1') };
    expect(
      bakePlan([{ ...wave, attrs: { ...wave.attrs, outfit: 'beanie' } }], done, 'apng-1').make,
    ).toHaveLength(1);
    expect(bakePlan([wave], done, 'apng-2').make).toHaveLength(1);
  });
});
