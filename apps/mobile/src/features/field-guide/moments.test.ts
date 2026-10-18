import { describe, expect, it } from '@jest/globals';

import {
  harvestToShow,
  parseSeen,
  rareBloomByKey,
  rareBloomToShow,
  rareKey,
  seenWith,
} from './moments';
import { DAY, T0, autumn, lot, page, summer } from './guide.test-data';

const rare = (plant: string, foundAt: number, change = {}) =>
  page(plant, autumn, { variant: 'rain_kissed', foundAt, ...change });

describe('a rare bloom', () => {
  it('shows the newest one this season that this phone hasn’t shown', () => {
    const state = {
      ...lot(),
      fieldGuide: [rare('heather', T0 + DAY), rare('aster', T0 + 2 * DAY), page('apple', autumn)],
    };
    const first = rareBloomToShow(state, 'p_bea', []);
    expect(first?.plant).toBe('aster');
    const next = rareBloomToShow(state, 'p_bea', first ? [first.key] : []);
    expect(next?.plant).toBe('heather');
    expect(
      rareBloomToShow(state, 'p_bea', seenWith(state, next ? [next.key] : [], first?.key ?? '')),
    ).toBeNull();
  });

  it('never shows one from a past season, or one that came by trade', () => {
    const state = {
      ...lot(),
      fieldGuide: [
        page('lavender', summer, { variant: 'sun_gold' }),
        rare('pumpkin', T0 + DAY, { via: 'traded' }),
      ],
    };
    expect(rareBloomToShow(state, 'p_bea', [])).toBeNull();
  });

  it('is only for members who were on the farm when it bloomed', () => {
    const state = { ...lot(), fieldGuide: [rare('heather', T0 - DAY)] };
    expect(rareBloomToShow(state, 'p_bea', [])).toBeNull();
    expect(rareBloomToShow(state, 'p_nobody', [])).toBeNull();
  });

  it('keeps only this season’s keys in the seen list', () => {
    const state = { ...lot(), fieldGuide: [rare('heather', T0 + DAY)] };
    const old = rareKey({ plant: 'lavender', variant: 'sun_gold', season: summer });
    const key = rareKey({ plant: 'heather', variant: 'rain_kissed', season: autumn });
    expect(seenWith(state, [old], key)).toEqual([key]);
    expect(rareBloomByKey(state, key)?.plant).toBe('heather');
  });

  it('reads a damaged flag as nothing seen', () => {
    expect(parseSeen('{')).toEqual([]);
    expect(parseSeen('["a",1]')).toEqual(['a']);
    expect(parseSeen(null)).toEqual([]);
  });
});

describe('harvest day', () => {
  const basket = (crops = [{ plant: 'pumpkin', variant: null }]) => ({
    ...lot(),
    basket: { season: autumn, crops },
  });

  it('shows this season’s basket once', () => {
    expect(harvestToShow(basket(), 'p_bea', null)?.key).toBe('2026-autumn');
    expect(harvestToShow(basket(), 'p_bea', '2026-autumn')).toBeNull();
  });

  it('still shows it just after the season rolls over', () => {
    const rolled = { ...basket(), season: { season: 'winter' as const, year: 2026 } };
    expect(harvestToShow(rolled, 'p_bea', '2026-summer')?.crops).toHaveLength(1);
    const later = { ...basket(), season: { season: 'spring' as const, year: 2027 } };
    expect(harvestToShow(later, 'p_bea', null)).toBeNull();
  });

  it('has no moment when nothing bloomed', () => {
    expect(harvestToShow(basket([]), 'p_bea', null)).toBeNull();
  });

  it('is not for someone who joined after the season ended', () => {
    const state = basket();
    const members = state.members.map((m) => ({ ...m, joinedAt: Date.UTC(2026, 11, 2) }));
    expect(harvestToShow({ ...state, members }, 'p_bea', null)).toBeNull();
  });
});
