import { describe, expect, it } from 'vitest';

import { formatEntry, pluralCategory } from './format';

describe('formatEntry', () => {
  it('fills placeholders and leaves an unfilled one visible', () => {
    expect(formatEntry('en', '{name} planted {plant}', { name: 'Pip', plant: 'clover' })).toBe(
      'Pip planted clover',
    );
    expect(formatEntry('en', '{name} planted {plant}', { name: 'Pip' })).toBe(
      'Pip planted {plant}',
    );
    expect(formatEntry('vi', 'Chào {name}', { name: 'Bea' })).toBe('Chào Bea');
  });

  it('picks the English plural form from the count', () => {
    const critters = { one: '{count} critter lives here', other: '{count} critters live here' };
    expect(formatEntry('en', critters, { count: 1 })).toBe('1 critter lives here');
    expect(formatEntry('en', critters, { count: 14 })).toBe('14 critters live here');
    expect(formatEntry('en', critters, { count: 0 })).toBe('0 critters live here');
  });

  it('reads Vietnamese plurals from `other` alone', () => {
    expect(formatEntry('vi', { other: '{count} bạn thú sống ở đây' }, { count: 1 })).toBe(
      '1 bạn thú sống ở đây',
    );
  });

  it('falls back to `other` when there is no count', () => {
    expect(formatEntry('en', { one: 'one', other: 'many' })).toBe('many');
  });
});

describe('pluralCategory', () => {
  it('follows each language’s rules', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 2)).toBe('other');
    expect(pluralCategory('vi', 1)).toBe('other');
  });
});
