import { describe, expect, it } from '@jest/globals';

import { typeAt } from './type-at';

describe('farm text at a size of its own', () => {
  it('keeps the design’s size and line in English', () => {
    expect(typeAt('handS', 13, 13, 'en')).toMatchObject({ fontSize: 13, lineHeight: 13 });
  });

  it('gives Vietnamese the taller line its stacked marks need, in its own face', () => {
    const vi = typeAt('handS', 13, 13, 'vi');
    expect(vi.fontFamily).not.toBe(typeAt('handS', 13, 13, 'en').fontFamily);
    expect(vi.lineHeight).toBeGreaterThan(vi.fontSize ?? 0);
  });
});
