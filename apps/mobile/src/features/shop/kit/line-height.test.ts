import { describe, expect, it } from '@jest/globals';

import { lineHeightOf } from './line-height';

describe('the shop’s line heights', () => {
  it('keeps the design’s line height for the system and serif faces', () => {
    expect(lineHeightOf('sys', 17, 1, 'en')).toBe(17);
    expect(lineHeightOf('serif', 26, 1.12, 'en')).toBe(29.1);
  });

  it('never sets the hand face solid: Gaegu takes its own 1.1', () => {
    expect(lineHeightOf('hand', 20, 1, 'en')).toBe(22);
    expect(lineHeightOf('hand', 17, 1.1, 'en')).toBe(18.7);
  });

  it('gives Vietnamese the room its stacked marks need', () => {
    expect(lineHeightOf('sys', 20, 1, 'vi')).toBe(28);
    expect(lineHeightOf('sys', 15, 1.45, 'vi')).toBe(21.8);
  });
});
