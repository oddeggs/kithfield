import { describe, expect, it } from '@jest/globals';

import { typeAt } from './type-at';

describe('farm text at a size of its own', () => {
  it('keeps the design’s size and line, for its Txt to set in the app’s faces', () => {
    expect(typeAt('handS', 13, 13, 'en')).toEqual({ fontSize: 13, lineHeight: 13 });
    expect(typeAt('displayM', 26, 28.6, 'vi')).toEqual({ fontSize: 26, lineHeight: 28.6 });
  });
});
