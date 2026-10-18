import { describe, expect, it } from '@jest/globals';

import { glyphShift } from './styles';

describe('glyph shift', () => {
  it('moves glyphs down by half their overflow of a tight line', () => {
    // SF at 17 on a 17-point line: 1.193 × 17 − 17 overflows by 3.28.
    expect(glyphShift('system', 17, 17)).toBeCloseTo(1.64, 2);
  });

  it('leaves lines taller than the glyphs alone', () => {
    expect(glyphShift('system', 15, 22)).toBe(0);
  });

  it('grows with Dynamic Type', () => {
    expect(glyphShift('system', 17, 17, 2)).toBeCloseTo(3.28, 2);
  });

  it('uses each face’s own metrics', () => {
    expect(glyphShift('YoungSerif-Regular', 18, 18)).toBeCloseTo(3.71, 2);
    expect(glyphShift('Gaegu-Bold', 14, 14)).toBe(0);
  });
});
