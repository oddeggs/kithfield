import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fonts, SYSTEM_LINE_HEIGHT } from '@kithfield/theme';
import { PixelRatio, Platform } from 'react-native';

import { fontSizeMultiplier } from './dynamic-type';
import { leading } from './leading';

// Young Serif's own line height is 1.412 em: at 60 that is 84.72, 24.72 more than a 60 line,
// rounded up to whole pairs of pixels at 3× (2/3 of a point): 38 pairs.
const display = { fontFamily: fonts.youngSerif, fontSize: 60, lineHeight: 60 };
const LOST = (38 * 2) / 3;

beforeEach(() => {
  jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('leading on iOS', () => {
  it('gives wrapping text its room back as top padding and holds its box with margins', () => {
    const out = leading(display);
    expect(out.lineHeight).toBe(60);
    expect(out.paddingTop).toBeCloseTo(LOST, 6);
    expect(out.marginTop).toBeCloseTo(-LOST / 2, 6);
    expect(out.marginBottom).toBeCloseTo(-LOST / 2, 6);
  });

  it('sets one-line text at the face’s own line height, on the pixel grid, so its baseline stays put', () => {
    const out = leading(display, true);
    expect(out.lineHeight).toBeCloseTo(60 + LOST, 6);
    expect(out.lineHeight).toBeGreaterThanOrEqual(84.72);
    expect(out.paddingTop).toBeUndefined();
    expect(out.marginTop).toBeCloseTo(-LOST / 2, 6);
    expect(out.marginBottom).toBeCloseTo(-LOST / 2, 6);
  });

  it('adds to the margins and padding the style already sets, however it sets them', () => {
    const out = leading({ ...display, marginTop: 8, marginVertical: 2, padding: 4 });
    expect(out.marginTop).toBeCloseTo(8 - LOST / 2, 6);
    expect(out.marginBottom).toBeCloseTo(2 - LOST / 2, 6);
    expect(out.paddingTop).toBeCloseTo(4 + LOST, 6);
    expect(leading({ ...display, margin: 10 }, true).marginBottom).toBeCloseTo(10 - LOST / 2, 6);
  });

  it('leaves a box it cannot hold in points where it is, but still gives the room', () => {
    const out = leading({ ...display, marginTop: 'auto' });
    expect(out.marginTop).toBe('auto');
    expect(out.paddingTop).toBeCloseTo(LOST, 6);
  });

  it('grows the room with Dynamic Type, in points', () => {
    // 49.44 points as drawn: 75 pairs.
    const out = leading(display, false, 2);
    expect(out.lineHeight).toBe(60);
    expect(out.paddingTop).toBeCloseTo(50, 6);
    expect(out.marginTop).toBeCloseTo(-25, 6);
  });

  it('leaves text with room enough, or no line height, as it is', () => {
    const body = { fontSize: 15, lineHeight: 22 };
    expect(leading(body)).toBe(body);
    const exact = { fontSize: 10, lineHeight: 10 * SYSTEM_LINE_HEIGHT };
    expect(leading(exact)).toBe(exact);
    const free = { fontFamily: fonts.youngSerif, fontSize: 60 };
    expect(leading(free)).toBe(free);
  });

  it('measures the system face by SF Pro', () => {
    // 17 × 1.1934 = 20.29 on a 17 line: 3.29, so 5 pairs.
    expect(leading({ fontSize: 17, lineHeight: 17 }).paddingTop).toBeCloseTo(10 / 3, 6);
  });
});

describe('leading elsewhere', () => {
  it('leaves Android untouched', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(leading(display)).toBe(display);
    expect(leading(display, true)).toBe(display);
  });
});

describe('Dynamic Type multiplier', () => {
  it('follows the text style’s own sizes when the text has one', () => {
    expect(fontSizeMultiplier({ fontScale: 1, ramp: 'body' })).toBe(1);
    // AX5: body 17 → 53, large title 34 → 60.
    expect(fontSizeMultiplier({ fontScale: 3.571, ramp: 'body' })).toBeCloseTo(53 / 17, 6);
    expect(fontSizeMultiplier({ fontScale: 3.571, ramp: 'largeTitle' })).toBeCloseTo(60 / 34, 6);
  });

  it('takes fontScale for text with no style, and respects the caps', () => {
    expect(fontSizeMultiplier({ fontScale: 3.571, ramp: null })).toBe(3.571);
    const capped = { fontScale: 3.571, ramp: null, maxFontSizeMultiplier: 2 };
    expect(fontSizeMultiplier(capped)).toBe(2);
    const off = { fontScale: 3.571, ramp: 'body', allowFontScaling: false } as const;
    expect(fontSizeMultiplier(off)).toBe(1);
  });
});
