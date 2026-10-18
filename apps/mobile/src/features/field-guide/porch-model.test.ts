import { describe, expect, it } from '@jest/globals';
import type { FarmState, PorchPot } from '@kithfield/contracts';

import { pressedCount, porchFrozen, scrapbookCards, stageBar, wateredBy } from './porch-model';
import { T0, lot, summer } from './guide.test-data';

const pot = (change: Partial<PorchPot> = {}): PorchPot => ({
  plant: 'cosmos',
  stage: 2,
  dew: 0,
  rare: null,
  rareRolledOn: null,
  bloomedAt: null,
  credits: [],
  pressed: [],
  ...change,
});

const visit = (change: Partial<PorchPot> = {}): FarmState => ({
  ...lot(),
  kind: 'visit',
  name: null,
  plants: [],
  signature: null,
  pot: pot(change),
});

describe('the little scrapbook', () => {
  it('has four cards: pressed, growing now, and waiting', () => {
    const state = visit({
      pressed: [
        { season: { season: 'spring', year: 2026 }, plant: 'forgetmenot', pressedAt: T0 - 1 },
        { season: summer, plant: 'nasturtium', pressedAt: T0 },
      ],
    });
    const cards = scrapbookCards(state);
    expect(cards.map((c) => [c.season, c.plant, c.kind])).toEqual([
      ['spring', 'forgetmenot', 'pressed'],
      ['summer', 'nasturtium', 'pressed'],
      ['autumn', 'cosmos', 'growing'],
      ['winter', 'paperwhite', 'waiting'],
    ]);
    expect(cards[2]?.stage).toBe(2);
    expect(cards[3]?.startMonth).toBe(12);
    expect(pressedCount(state)).toBe(2);
  });

  it('keeps the latest bloom pressed in a season', () => {
    const state = visit({
      pressed: [
        { season: { season: 'summer', year: 2026 }, plant: 'nasturtium', pressedAt: T0 },
        { season: { season: 'summer', year: 2027 }, plant: 'nasturtium', pressedAt: T0 + 9 },
      ],
    });
    expect(scrapbookCards(state)[1]?.pressedAt).toBe(T0 + 9);
    expect(pressedCount(state)).toBe(2);
  });

  it('starts waiting seasons by the visit’s hemisphere', () => {
    expect(scrapbookCards({ ...visit(), hemisphere: 'south' })[3]?.startMonth).toBe(6);
  });
});

describe('the porch pot', () => {
  it('fills the stage bar up to its stage', () => {
    expect(stageBar(2)).toEqual([true, true, true, false, false]);
  });

  it('names who watered it by kind of care, never how much', () => {
    const state = visit({
      credits: [
        { person: 'p_june', kinds: ['voice', 'message'] },
        { person: 'p_bea', kinds: ['message'] },
      ],
    });
    expect(wateredBy(state, 'p_bea')).toEqual({
      mine: 'message',
      theirs: { person: 'p_june', kind: 'voice' },
    });
    expect(wateredBy(visit(), 'p_bea')).toEqual({ mine: null, theirs: null });
  });

  it('is frozen, still readable, once one of the two has gone', () => {
    const state = visit();
    expect(porchFrozen(state)).toBe(false);
    expect(porchFrozen({ ...state, members: state.members.slice(0, 1) })).toBe(true);
  });
});
