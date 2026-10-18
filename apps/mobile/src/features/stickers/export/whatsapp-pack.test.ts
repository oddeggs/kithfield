import { describe, expect, it } from '@jest/globals';

import { fitPack, packIdentifier } from './whatsapp-pack';

const sticker = (id: string, fits: boolean) => ({ id, bytes: new Uint8Array(1), fits });

describe('the pack WhatsApp takes', () => {
  it('leaves out a sticker over the limit and says which', () => {
    const fitted = fitPack([
      sticker('wave', true),
      sticker('swing', false),
      sticker('hug', true),
      sticker('yay', true),
    ]);
    expect(fitted).toEqual({
      ok: true,
      kept: [sticker('wave', true), sticker('hug', true), sticker('yay', true)],
      dropped: ['swing'],
    });
  });

  it('gives up when fewer than three fit', () => {
    expect(fitPack([sticker('wave', true), sticker('swing', false), sticker('hug', true)])).toEqual(
      {
        ok: false,
      },
    );
  });

  it('holds at most thirty', () => {
    const many = Array.from({ length: 34 }, (_, i) => sticker(`s${i}`, true));
    const fitted = fitPack(many);
    expect(fitted.ok && fitted.kept).toHaveLength(30);
  });
});

describe('the pack’s identifier', () => {
  it('is made once, at random, and kept on the phone: never the person', () => {
    let kept: string | null = null;
    const store = { read: () => kept, write: (id: string) => void (kept = id) };
    let n = 0;
    const random = () => `r${++n}`;
    const first = packIdentifier(store, random);
    expect(first).toMatch(/^kithfield_[A-Za-z0-9_.-]+$/);
    expect(first).not.toContain('person');
    expect(packIdentifier(store, random)).toBe(first);
  });
});
