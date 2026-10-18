import { describe, expect, it } from '@jest/globals';
import { farmView } from '@kithfield/farm';
import { translator } from '@kithfield/i18n';

import {
  crowdLine,
  farmCredits,
  flagOf,
  headcount,
  hoursLeft,
  listOf,
  planLine,
  seasonLabel,
} from './farm-copy';
import { DAY, farmLog } from './farm-log.test-data';

const en = translator('en');
const vi = translator('vi');

describe('the farm’s credits', () => {
  it('rest quietly before anyone has tended', () => {
    const log = farmLog([['p_bea', 'sheep']]);
    const state = log.state();
    const credits = farmCredits(en, state, farmView(state, log.at));
    expect(credits.people).toEqual([]);
    expect(credits.lead).toBe('The field is resting.');
  });

  it('name the plant, who it thanks and for what, never how much', () => {
    const log = farmLog([
      ['p_bea', 'sheep'],
      ['p_fig', 'frog'],
      ['p_mo', 'mole'],
    ]);
    for (let i = 0; i < 3; i++) log.wait(60_000).add('dewdrop', 'p_fig', {});
    for (let i = 0; i < 3; i++) log.wait(60_000).add('message', 'p_mo', { text: `hi ${i}` });
    const state = log.state();
    const credits = farmCredits(en, state, farmView(state, log.at));
    expect(credits.lead).toBe('The marigold’s sprouting');
    expect(credits.rest).toBe('thanks to fig’s dewdrops. mo’s notes kept the kettle warm.');
    expect(credits.people).toEqual(['p_fig', 'p_mo']);
    expect(`${credits.lead} ${credits.rest}`).not.toMatch(/\d/);
  });

  it('read in Vietnamese with the care before the name', () => {
    const log = farmLog([['p_fig', 'frog']]);
    for (let i = 0; i < 3; i++) log.wait(60_000).add('dewdrop', 'p_fig', {});
    const state = log.state();
    const credits = farmCredits(vi, state, farmView(state, log.at));
    expect(credits.rest).toBe('nhờ có những giọt sương của fig.');
  });
});

describe('the farm’s words', () => {
  it('names the season by its third, in either hemisphere', () => {
    expect(seasonLabel(en, 'spring', '2026-05-12', 'north')).toBe('late spring');
    expect(seasonLabel(en, 'summer', '2026-07-01', 'north')).toBe('high summer');
    expect(seasonLabel(en, 'winter', '2026-12-03', 'north')).toBe('first frost');
    expect(seasonLabel(en, 'autumn', '2026-03-20', 'south')).toBe('early autumn');
  });

  it('lists names as the language does', () => {
    expect(listOf(en, ['Pip'])).toBe('Pip');
    expect(listOf(en, ['Pip', 'Fig', 'Bea'])).toBe('Pip, Fig and Bea');
    expect(listOf(vi, ['Pip', 'Fig'])).toBe('Pip và Fig');
  });

  it('says what a plan still needs', () => {
    const plan = (day: boolean, place: boolean, yeses: boolean) => ({
      seed: { someday: false } as never,
      conditions: { day, place, yeses },
      stage: 0,
    });
    expect(planLine(en, plan(true, false, false))).toBe('Has a day. Still needs a place.');
    expect(planLine(en, plan(true, true, true))).toBe('Sprouted. It’s happening.');
  });

  it('counts who lives here in words, as the design writes it', () => {
    expect(headcount(en, 12)).toBe('Twelve critters live here');
    expect(headcount(en, 1)).toBe('One critter lives here');
    expect(headcount(vi, 24)).toBe('Hai mươi tư bạn thú sống ở đây');
  });

  it('writes a plan’s flag in the design’s short hand', () => {
    expect(flagOf(en, 'Picnic by the river')).toBe('picnic?');
  });

  it('counts a bubble’s hours left, rounding up', () => {
    expect(hoursLeft(0, 60 * 60 * 1000 + 1, DAY)).toBe(23);
    expect(hoursLeft(0, DAY - 1, DAY)).toBe(1);
    // A bubble stamped a little ahead of this phone's clock still has a day at most.
    expect(hoursLeft(10 * 60_000, 0, DAY)).toBe(24);
  });

  it('says who lives here by kind, most first', () => {
    expect(crowdLine(en, ['rabbit', 'fox', 'rabbit', 'owl'])).toBe('Two rabbits, a fox and an owl');
    expect(crowdLine(en, ['fox', 'owl'])).toBe('A fox and an owl');
  });
});
