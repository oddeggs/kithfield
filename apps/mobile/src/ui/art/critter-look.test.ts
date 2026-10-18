import { describe, expect, it } from '@jest/globals';
import type { Critter } from '@kithfield/contracts';

import { castOf, lookOf, sceneLook } from './critter-look';

const fox: Critter = {
  species: 'fox',
  coat: 'default',
  mark: null,
  accessory: 'scarf',
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
};

describe('drawing a critter as the contracts carry it', () => {
  it('draws the accessory in its colour and leaves the default coat to the art', () => {
    expect(lookOf(fox)).toEqual({ accessory: { name: 'scarf', color: '#5e7f4a' } });
  });

  it('gives a scene the accessory in its one slot when nothing else is worn', () => {
    expect(sceneLook(fox)).toEqual({ kind: 'fox', outfit: 'scarf', ocolor: '#5e7f4a' });
    expect(castOf(fox, 'z')).toBe('fox///scarf/#5e7f4a/z');
  });

  it('gives a scene the outfit over the accessory', () => {
    const dressed = { ...fox, coat: 'arctic', outfit: 'raincoat', outfitColor: '#d4704e' };
    expect(sceneLook(dressed)).toEqual({
      kind: 'fox',
      coat: 'arctic',
      outfit: 'raincoat',
      ocolor: '#d4704e',
    });
    expect(lookOf(dressed)).toEqual({
      coat: 'arctic',
      outfit: { name: 'raincoat', color: '#d4704e' },
      accessory: { name: 'scarf', color: '#5e7f4a' },
    });
  });
});
