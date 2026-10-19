import { describe, expect, it } from '@jest/globals';
import { translator } from '@kithfield/i18n';

import { entryOf } from './guide-model';
import { autumn, lot, page, withPlant } from './guide.test-data';
import { harvestNote, plantCredits, potLine, rareBody, rareLine, sleepyLine } from './page-copy';

const en = translator('en');
const entry = (id: string) => {
  const e = entryOf(id);
  if (!e) throw new Error(`no ${id}`);
  return e;
};

describe('who grew a plant', () => {
  it('names the first to tend it by their care, then the others, with no numbers', () => {
    const state = withPlant(lot(), 'heather', {
      credits: [
        { person: 'p_bea', kinds: ['voice', 'fire'] },
        { person: 'p_june', kinds: ['fire'] },
      ],
    });
    const line = plantCredits(en, state, entry('heather'), false);
    expect(line?.bold).toBe('bea’s voice notes');
    expect(`${line?.before}${line?.bold}${line?.after}`).toBe(
      'bea’s voice notes grew this row. june’s helped too.',
    );
    expect(line?.people).toEqual(['p_bea', 'p_june']);
    expect(`${line?.before}${line?.after}`).not.toMatch(/\d/);
  });

  it('says what grows a plant nobody has tended yet', () => {
    const line = plantCredits(en, lot(), entry('heather'), false);
    expect(line?.before).toBe('Anyone’s voice notes and time by the fire grow it, any day.');
  });

  it('credits everyone for a page from a past season, and waits for one to come', () => {
    expect(plantCredits(en, lot(), entry('lavender'), true)?.before).toBe(
      'Everyone on the farm grew this one together.',
    );
    expect(plantCredits(en, lot(), entry('holly'), false)?.before).toBe(
      'It grows from voice notes and time by the fire, when winter comes round.',
    );
    expect(plantCredits(en, lot(), entry('rose'), false)).toBeNull();
  });
});

describe('a plant’s rules', () => {
  it('says how long before it naps, by its family', () => {
    expect(sleepyLine(en, 'en', lot(), entry('lavender'))).toBe(
      'If nobody leaves a voice note or sits by the fire for 7 days, the lavender droops and naps. One from anyone wakes it straight back up.',
    );
    expect(sleepyLine(en, 'en', lot(), entry('holly'))).toContain('for 14 days');
  });

  it('offers the rain-kissed variant, or the one the farm found', () => {
    const offer = rareLine(en, 'en', lot(), entry('lavender'));
    expect(offer?.bold).toBe('rain-kissed lavender');
    const state = {
      ...lot(),
      fieldGuide: [
        page('heather', autumn, { variant: 'frost_lace', foundAt: Date.UTC(2026, 9, 20) }),
      ],
    };
    const found = rareLine(en, 'en', state, entry('heather'));
    expect(`${found?.before}${found?.bold}${found?.after}`).toBe(
      'Rare: frost-lace heather bloomed here in October.',
    );
    expect(rareLine(en, 'en', lot(), entry('rose'))).toBeNull();
  });
});

describe('a rare bloom', () => {
  it('names who was on the farm in the shared rain, you first', () => {
    const state = {
      ...withPlant(lot(), 'heather', { rareRolledOn: '2026-10-18' }),
      sharedRainDay: '2026-10-18',
    };
    expect(rareBody(en, state, 'p_june', 'heather', 'rain_kissed', ['p_bea', 'p_june'])).toBe(
      'It opened after you and bea were all on the farm in the rain. It’s pressed into your field guide now.',
    );
    expect(rareBody(en, state, 'p_june', 'heather', 'rain_kissed', null)).toContain(
      'friends were on the farm together',
    );
  });

  it('says the weather otherwise', () => {
    expect(rareBody(en, lot(), 'p_bea', 'heather', 'frost_lace', null)).toBe(
      'It opened on a real frosty morning where your farm is. It’s pressed into your field guide now.',
    );
  });
});

describe('harvest day', () => {
  it('names quieter friends’ care in the basket, never you, never ranked', () => {
    let state = withPlant(lot(), 'pumpkin', {
      credits: [
        { person: 'p_bea', kinds: ['checkin'] },
        { person: 'p_june', kinds: ['vote'] },
      ],
    });
    state = withPlant(state, 'heather', { credits: [{ person: 'p_bea', kinds: ['voice'] }] });
    state = { ...state, basket: { season: autumn, crops: [] } };
    const crops = [
      { plant: 'pumpkin', variant: null },
      { plant: 'heather', variant: null },
    ];
    expect(harvestNote(en, state, crops, 'p_bea')).toBe(
      'Everyone’s care is in the basket, including june’s votes. Nothing is ranked.',
    );
    expect(harvestNote(en, state, crops, 'p_nobody')).toBe(
      'Everyone’s care is in the basket, including june’s votes and bea’s voice notes. Nothing is ranked.',
    );
    expect(harvestNote(en, lot(), crops, 'p_bea')).toBe(
      'Everyone’s care is in the basket. Nothing is ranked.',
    );
  });
});

describe('the porch pot', () => {
  it('says who watered it', () => {
    const state = {
      ...lot(),
      pot: {
        plant: 'cosmos',
        stage: 2,
        dew: 0,
        rare: null,
        rareRolledOn: null,
        bloomedAt: null,
        credits: [
          { person: 'p_june', kinds: ['voice'] },
          { person: 'p_bea', kinds: ['message'] },
        ],
        pressed: [],
      },
    };
    expect(potLine(en, state, 'p_bea')).toBe('june’s voice notes and your notes both watered it.');
    expect(potLine(en, { ...state, pot: { ...state.pot, credits: [] } }, 'p_bea')).toBe(
      'It’s waiting for its first drop of care.',
    );
  });
});
