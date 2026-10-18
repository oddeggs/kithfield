import { describe, expect, it } from 'vitest';

import { fontLocaleFor, isLanguage, pickLanguage } from './pick-language';

describe('pickLanguage', () => {
  it('follows the device, a stored choice wins, English is the fallback', () => {
    expect(pickLanguage(['vi-VN', 'en-US'])).toBe('vi');
    expect(pickLanguage(['en-GB', 'vi-VN'])).toBe('en');
    expect(pickLanguage(['fr-FR', 'vi_VN'])).toBe('vi');
    expect(pickLanguage(['vi-VN'], 'en')).toBe('en');
    expect(pickLanguage(['en-US'], 'vi')).toBe('vi');
    expect(pickLanguage(['fr-FR'])).toBe('en');
    expect(pickLanguage([], 'fr')).toBe('en');
    expect(pickLanguage(['VI'])).toBe('vi');
  });

  it('recognises only the languages we ship', () => {
    expect(isLanguage('vi')).toBe(true);
    expect(isLanguage('vi-VN')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});

describe('fontLocaleFor', () => {
  it('swaps the whole font stack for Vietnamese only', () => {
    expect(fontLocaleFor('vi')).toBe('vi');
    expect(fontLocaleFor('en')).toBe('default');
  });
});
