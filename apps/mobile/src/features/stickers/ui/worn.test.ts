import { describe, expect, it } from '@jest/globals';
import type { Critter } from '@kithfield/contracts';
import { translator } from '@kithfield/i18n';

import { wornName } from './worn';

const critter = (accessory: string | null, outfit: string | null = null): Critter => ({
  species: 'rabbit',
  coat: 'default',
  mark: null,
  accessory,
  outfit,
  outfitColor: null,
  companion: null,
  cottage: null,
});

describe('what a critter wears, in words', () => {
  it('names the accessory, with its colour when asked', () => {
    const en = translator('en');
    expect(wornName(en, critter('scarf'))).toBe('scarf');
    expect(wornName(en, critter('scarf'), true)).toBe('green scarf');
    expect(wornName(en, critter('glasses'), true)).toBe('specs');
    expect(wornName(translator('vi'), critter('scarf'), true)).toBe('khăn quàng xanh lá');
  });

  it('says nothing for a critter in its own coat', () => {
    expect(wornName(translator('en'), critter(null), true)).toBeNull();
  });
});
