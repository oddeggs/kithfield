import { describe, expect, it } from '@jest/globals';

import { firstInSticker } from './in-sticker';

const sticker = (seq: number, actor: string, drawn?: string[]) => ({
  seq,
  kind: 'sticker',
  actor,
  payload: { pack: 'mine', sticker: 'us', ...(drawn ? { with: drawn } : {}) },
});

describe('the one "you’re in a sticker" note', () => {
  it('finds the first together sticker a friend drew you into', () => {
    const events = [sticker(1, 'pip'), sticker(2, 'me', ['pip']), sticker(3, 'pip', ['bea', 'me'])];
    expect(firstInSticker(events, 'me', false)?.seq).toBe(3);
  });

  it('stays quiet once noted, or with nothing to note', () => {
    expect(firstInSticker([sticker(3, 'pip', ['me'])], 'me', true)).toBeNull();
    expect(firstInSticker([sticker(3, 'pip', ['bea'])], 'me', false)).toBeNull();
    expect(firstInSticker([sticker(3, 'pip', ['me'])], null, false)).toBeNull();
  });
});
