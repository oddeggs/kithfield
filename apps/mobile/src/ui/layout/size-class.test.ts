import { describe, expect, it } from '@jest/globals';

import { hasFarmPane, hasSidebar, layoutFor, paneWidths } from './size-class';

describe('layoutFor', () => {
  it('keeps every phone in portrait on the phone layout', () => {
    expect(layoutFor({ width: 393, height: 852, pad: false })).toBe('phone');
    expect(layoutFor({ width: 440, height: 956, pad: false })).toBe('phone');
  });

  it('keeps a foldable closed on the phone layout', () => {
    expect(layoutFor({ width: 466, height: 678, pad: false })).toBe('phone');
  });

  it('puts the farm beside the chat on a foldable opened up', () => {
    expect(layoutFor({ width: 951, height: 669, pad: false })).toBe('pair');
  });

  it('keeps a wide phone window that is still taller than wide on the phone layout', () => {
    expect(layoutFor({ width: 669, height: 951, pad: false })).toBe('phone');
  });

  it('gives an iPad in landscape three columns', () => {
    expect(layoutFor({ width: 1180, height: 820, pad: true })).toBe('wide');
    expect(layoutFor({ width: 1376, height: 1032, pad: true })).toBe('wide');
  });

  it('reflows at 900 points', () => {
    expect(layoutFor({ width: 900, height: 820, pad: true })).toBe('wide');
    expect(layoutFor({ width: 899, height: 820, pad: true })).toBe('columns');
  });

  it('gives an iPad in portrait two columns, with the farm in the chat header', () => {
    expect(layoutFor({ width: 820, height: 1180, pad: true })).toBe('columns');
    expect(layoutFor({ width: 744, height: 1133, pad: true })).toBe('columns');
  });

  it('goes back to the phone layout in Slide Over and a narrow Split View', () => {
    expect(layoutFor({ width: 320, height: 1180, pad: true })).toBe('phone');
    expect(layoutFor({ width: 375, height: 820, pad: true })).toBe('phone');
    expect(layoutFor({ width: 590, height: 820, pad: true })).toBe('phone');
    expect(layoutFor({ width: 600, height: 820, pad: true })).toBe('columns');
  });
});

describe('what each layout shows', () => {
  it('shows farms and visits beside the chat only on an iPad', () => {
    expect(hasSidebar('phone')).toBe(false);
    expect(hasSidebar('columns')).toBe(true);
    expect(hasSidebar('wide')).toBe(true);
    expect(hasSidebar('pair')).toBe(false);
  });

  it('gives the farm a column in landscape and on an opened foldable', () => {
    expect(hasFarmPane('phone')).toBe(false);
    expect(hasFarmPane('columns')).toBe(false);
    expect(hasFarmPane('wide')).toBe(true);
    expect(hasFarmPane('pair')).toBe(true);
  });
});

describe('paneWidths', () => {
  it('gives a phone the whole window', () => {
    expect(paneWidths('phone', 393)).toEqual({ leading: 0, main: 393, trailing: 0, gutter: 0 });
  });

  it('measures the three iPad columns as drawn', () => {
    expect(paneWidths('wide', 1180)).toEqual({ leading: 270, main: 530, trailing: 380, gutter: 0 });
    expect(paneWidths('columns', 820)).toEqual({ leading: 270, main: 550, trailing: 0, gutter: 0 });
  });

  it('splits a foldable at its fold, the chat clear of it', () => {
    expect(paneWidths('pair', 900)).toEqual({ leading: 450, main: 450, trailing: 0, gutter: 24 });
  });

  it('always adds up to the window', () => {
    for (const kind of ['phone', 'columns', 'wide', 'pair'] as const) {
      const w = paneWidths(kind, 1001);
      expect(w.leading + w.main + w.trailing).toBe(1001);
    }
  });
});
