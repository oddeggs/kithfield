import { describe, expect, it } from '@jest/globals';

import { farmTogether, keepDrawable, togetherOffers, togglePick } from './together';

describe('picking friends for a together sticker', () => {
  it('adds and takes away, but always keeps one', () => {
    expect(togglePick(['pip'], 'bea')).toEqual(['pip', 'bea']);
    expect(togglePick(['pip', 'bea'], 'pip')).toEqual(['bea']);
    expect(togglePick(['pip'], 'pip')).toEqual(['pip']);
  });

  it('makes room for a fifth by letting the first go', () => {
    expect(togglePick(['a', 'b', 'c', 'd'], 'e')).toEqual(['b', 'c', 'd', 'e']);
  });

  it('drops anyone who can no longer be drawn', () => {
    expect(keepDrawable(['a', 'b', 'c'], new Set(['c', 'a']))).toEqual(['a', 'c']);
  });

  it('offers the big one of everyone, then four more', () => {
    const { main, more } = togetherOffers(['pip', 'bea']);
    expect(main?.def.id).toBe('us');
    expect(main?.with).toEqual(['pip', 'bea']);
    expect(more.map((o) => [o.def.id, o.with])).toEqual([
      ['gang', ['pip', 'bea']],
      ['missed', ['pip']],
      ['tower', ['pip', 'bea']],
      ['thanks', ['bea']],
    ]);
    expect(togetherOffers([])).toEqual({ main: null, more: [] });
  });

  it('spreads the picker’s Together tab across the farm', () => {
    const tab = farmTogether(['pip', 'fig', 'bea', 'otis', 'mo']);
    expect(tab.map((o) => [o.def.id, o.with])).toEqual([
      ['us', ['pip']],
      ['gang', ['fig', 'bea', 'otis']],
      ['proud', ['bea']],
      ['our_way', ['pip']],
      ['missed', ['otis']],
      ['love', ['mo']],
      ['tower', ['pip', 'fig']],
      ['thanks', ['fig']],
    ]);
    expect(farmTogether([])).toEqual([]);
    expect(farmTogether(['pip']).every((o) => o.with.length === 1 && o.with[0] === 'pip')).toBe(
      true,
    );
  });
});
