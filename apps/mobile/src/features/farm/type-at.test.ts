import { describe, expect, it } from '@jest/globals';

import { typeAt } from './type-at';

describe('farm text at a size of its own', () => {
  it('keeps the design’s size and line, for its Txt to set in the app’s faces', () => {
    expect(typeAt('handS', 13, 13, 'en')).toEqual({ fontSize: 13, lineHeight: 13 });
    expect(typeAt('displayM', 26, 28.6, 'vi')).toEqual({ fontSize: 26, lineHeight: 28.6 });
  });

  it('keeps a system step’s weight, whichever step its Txt scales with', () => {
    expect(typeAt('rowTitle', 10.5, 10.5, 'en')).toEqual({
      fontSize: 10.5,
      lineHeight: 10.5,
      fontWeight: '600',
    });
    expect(typeAt('caption', 12, 14.4, 'vi')).toMatchObject({ fontWeight: '400' });
  });
});
