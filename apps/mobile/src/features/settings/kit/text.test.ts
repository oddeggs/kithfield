import { describe, expect, it } from '@jest/globals';
import { vietnamese } from '@kithfield/theme';

import { kitLineHeight } from './text';

describe('the settings text', () => {
  it('keeps the design’s line heights in English', () => {
    expect(kitLineHeight('rowTitle', undefined, 'en')).toBe(19.4);
    expect(kitLineHeight('rowSub', { fontSize: 14, lineHeight: 18.2 }, 'en')).toBe(18.2);
  });

  it('never sets a section label tighter than its letters', () => {
    expect(kitLineHeight('settingsLabel', undefined, 'en')).toBeGreaterThan(12.5);
  });

  it('gives Vietnamese the taller line its stacked marks need, even where a screen sets one', () => {
    const tall = (size: number) => Math.round(size * vietnamese.minLineHeightRatio);
    expect(kitLineHeight('rowTitle', undefined, 'vi')).toBe(tall(15.5));
    expect(kitLineHeight('settingsLabel', undefined, 'vi')).toBe(tall(12.5));
    expect(kitLineHeight('rowSub', { fontSize: 14, lineHeight: 18.2 }, 'vi')).toBe(tall(14));
    expect(kitLineHeight('sheetBody', undefined, 'vi')).toBe(21.75);
  });
});
