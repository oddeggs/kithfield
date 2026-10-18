import { describe, expect, it } from '@jest/globals';
import { Critter, Species } from '@kithfield/contracts';

import {
  CRITTERS,
  DEFAULT_COAT,
  critterOf,
  crittersShaped,
  farmmateCheck,
  lookAttrs,
  lookOf,
  pickSpecies,
  type CritterChoice,
} from './critters';

const fox: CritterChoice = { species: 'fox', coat: DEFAULT_COAT, mark: 'none', accessory: 'scarf' };

describe('the critter picker', () => {
  it('offers all sixteen critters, each once, with its own coat first', () => {
    expect(CRITTERS.map((c) => c.species).sort()).toEqual([...Species.options].sort());
    for (const c of CRITTERS) expect(c.coats[0]?.id).toBe(DEFAULT_COAT);
  });

  it('filters by shape', () => {
    expect(crittersShaped('all')).toHaveLength(16);
    expect(crittersShaped('tall').map((c) => c.species)).toEqual(['rabbit', 'owl', 'fox', 'otter']);
  });

  it('starts a newly picked critter in its own coat', () => {
    const grey = { ...fox, coat: 'silver' };
    expect(pickSpecies(grey, 'cat')).toEqual({ ...grey, species: 'cat', coat: DEFAULT_COAT });
    expect(pickSpecies(grey, 'fox')).toBe(grey);
  });

  it('keeps a choice the way the API does', () => {
    const critter = critterOf({ ...fox, mark: 'blaze' });
    expect(Critter.parse(critter)).toEqual(critter);
    expect(critter).toMatchObject({ mark: 'blaze', accessory: 'scarf', outfit: null });
    expect(critterOf({ ...fox, accessory: 'none' }).accessory).toBeNull();
  });

  it('draws the accessory in the colour the picker shows', () => {
    expect(lookOf(critterOf(fox))).toEqual({ accessory: { name: 'scarf', color: '#5e7f4a' } });
    expect(lookAttrs(fox)).toEqual({ kind: 'fox', outfit: 'scarf', ocolor: '#5e7f4a' });
    expect(lookOf(critterOf({ ...fox, coat: 'arctic', accessory: 'glasses' }))).toEqual({
      coat: 'arctic',
      accessory: { name: 'glasses' },
    });
  });

  it('spots a lookalike on the farm, and someone easy to tell apart', () => {
    const twin = { critter: critterOf(fox), name: 'Rue' };
    const plain = { critter: critterOf({ ...fox, accessory: 'none' }), name: null };
    expect(farmmateCheck(fox, [plain, twin])).toEqual({ kind: 'twin', farmmate: twin });
    expect(farmmateCheck({ ...fox, accessory: 'bow' }, [plain, twin])).toEqual({
      kind: 'alike',
      farmmate: twin,
    });
    expect(farmmateCheck({ ...fox, species: 'owl' }, [plain, twin])).toBeNull();
  });
});
