import { type CareFamily, type EventKind, type FarmState } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import { FAMILIES, FAMILY_PLANTS, SEASONS, plantFor } from './catalog';
import {
  DAY,
  HOUR,
  MINUTE,
  T0,
  bea,
  expectSnapshot,
  fig,
  kit,
  newFarm,
  pip,
  plantOf,
} from './farm.test-data';
import { activeCount, kFor, stageFromDew, thresholdsFor } from './growth';
import { applyEvent } from './reducer';

const photo = {
  key: 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abc',
  mime: 'image/jpeg',
  bytes: 812_000,
};
const audio = { ...photo, mime: 'audio/aac' };
const plan = { title: 'Picnic', days: [], place: null, yeses: 'couple', someday: false };

/** Every row of the care families table, as kind, payload, family and dew. */
const careRows: [EventKind, object, CareFamily, number][] = [
  ['dewdrop', {}, 'dew', 1],
  ['message', { text: 'hello' }, 'words', 1],
  ['link', { url: 'https://example.com/picnic' }, 'words', 1],
  ['quiet_note', { text: 'no reply needed' }, 'words', 2],
  ['slow_post', { to: pip, text: 'hi', when: 'morning', deliverAt: T0 + DAY }, 'words', 2],
  ['media', { items: [photo] }, 'pictures', 2],
  ['sticker', { pack: 'mine', sticker: 'wave' }, 'pictures', 1],
  ['voice', { audio, durationMs: 4000, waveform: [] }, 'voices', 2],
  ['fire', { state: 'sat' }, 'voices', 2],
  ['firefly', { action: 'left', to: pip }, 'gestures', 2],
  ['wave', {}, 'gestures', 1],
  ['knock', { to: pip }, 'gestures', 1],
  ['hug', { to: pip }, 'gestures', 1],
  ['gift', { action: 'given', gift: 'g_1', to: pip, item: 'tea', wrap: 'kraft' }, 'gestures', 2],
  ['seed_planted', plan, 'gatherings', 1],
  ['vote', { seed: 99, option: 0, on: true }, 'gatherings', 1],
  ['rsvp', { seed: 99, answer: 'out' }, 'gatherings', 1],
  ['scrapbook_page', { action: 'pressed', title: 'Picnic', items: [] }, 'gatherings', 1],
];

const dewOf = (state: FarmState) => Object.fromEntries(state.plants.map((p) => [p.plant, p.dew]));

describe('Care families table', () => {
  it.each(careRows)('%s grows %s by its dew in the table', (kind, payload, family, dew) => {
    const log = newFarm();
    const before = log.state();
    log.add(kind, bea, payload);
    const after = log.state();
    const own = plantFor(family, 'autumn');
    const grown = Object.entries(dewOf(after)).filter(([plant, d]) => d !== dewOf(before)[plant]);
    expect(Object.fromEntries(grown)).toEqual({ [own]: dew, [after.signature ?? '']: dew });
    expect(after.familyTendedAt[family]).toBe(log.at);
    expect(after.members.find((m) => m.person === bea)?.lastTendedAt).toBe(log.at);
    expectSnapshot(after);
  });

  it.each<[EventKind, object]>([
    ['reaction', { target: 2, reaction: 'sun' }],
    ['edit', { target: 2, text: 'hello again' }],
    ['pin', { target: 2, on: true }],
    ['farm_opened', {}],
    ['status', { status: 'battery', battery: 'resting' }],
    ['firefly', { action: 'opened', target: 2 }],
    ['gift', { action: 'opened', gift: 'g_1' }],
    ['vote', { seed: 99, option: 0, on: false }],
    ['scrapbook_page', { action: 'hidden', target: 2 }],
    ['fire', { state: 'lit' }],
  ])('%s grows nothing (only the kinds in the table grow family plants)', (kind, payload) => {
    const log = newFarm();
    const before = log.state();
    log.add(kind, bea, payload);
    expect(dewOf(log.state())).toEqual(dewOf(before));
  });

  it('gives everyone at a hangout 3 once two people have checked in', () => {
    const log = newFarm({ members: [bea, pip, fig, kit] });
    const seed = log.add('seed_planted', bea, { ...plan, days: [{ date: '2026-10-18' }] });
    const gatherings = () => plantOf(log.state(), 'pumpkin').dew;
    const start = gatherings();
    log.add('checkin', pip, { seed: seed.seq });
    expect(gatherings()).toBe(start);
    log.add('checkin', fig, { seed: seed.seq });
    expect(gatherings()).toBe(start + 6);
    log.add('checkin', kit, { seed: seed.seq });
    log.add('checkin', kit, { seed: seed.seq });
    expect(gatherings()).toBe(start + 9);
    const credits = plantOf(log.state(), 'pumpkin').credits;
    expect(credits.find((c) => c.person === pip)?.kinds).toEqual(['checkin']);
  });

  it('grows a Gatherings tend for each person under shared rain', () => {
    const log = newFarm();
    log.add('shared_rain', null, { day: '2026-10-18', people: [bea, pip, fig] });
    const pumpkin = plantOf(log.state(), 'pumpkin');
    expect(pumpkin.dew).toBe(3);
    expect(pumpkin.credits.map((c) => c.kinds)).toEqual([
      ['shared_rain'],
      ['shared_rain'],
      ['shared_rain'],
    ]);
    expect(log.state().sharedRainDay).toBe('2026-10-18');
  });
});

describe('Care families: the plant for each family and season', () => {
  const table: Record<CareFamily, string[]> = {
    dew: ['clover', 'chamomile', 'marigold', 'snowdrop'],
    words: ['tulip', 'cornflower', 'aster', 'jasmine'],
    pictures: ['daffodil', 'sunflower', 'chrysanthemum', 'camellia'],
    voices: ['sweetpea', 'lavender', 'heather', 'holly'],
    gestures: ['bluebell', 'poppy', 'apple', 'moonflower'],
    gatherings: ['blossom', 'strawberry', 'pumpkin', 'hellebore'],
  };

  it('matches the table in the catalogue', () => {
    expect(FAMILY_PLANTS).toEqual(table);
  });

  it('grows the six family plants of each season, then the signature crop', () => {
    const log = newFarm();
    let year = 2026;
    for (const season of ['winter', 'spring', 'summer', 'autumn'] as const) {
      if (season === 'spring') year++;
      log.add('season_rolled', null, { season, year });
      const index = SEASONS.indexOf(season);
      const state = log.state();
      expect(state.plants.map((p) => p.plant)).toEqual([
        ...FAMILIES.map((f) => table[f][index]),
        state.signature,
      ]);
    }
  });
});

describe('Growth', () => {
  it('caps each person at 3 dew per plant per farm day; more tends still count', () => {
    const log = newFarm();
    for (let i = 0; i < 10; i++) log.wait(MINUTE).add('message', bea, { text: `note ${i}` });
    const aster = plantOf(log.state(), 'aster');
    expect(aster.dew).toBe(3);
    expect(log.state().familyTendedAt.words).toBe(log.at);
    log.add('message', pip, { text: 'me too' });
    expect(plantOf(log.state(), 'aster').dew).toBe(4);
    // The farm's day turns at midnight in London, not UTC.
    log.at = Date.UTC(2026, 9, 18, 22, 59);
    log.add('message', bea, { text: 'still today' });
    expect(plantOf(log.state(), 'aster').dew).toBe(4);
    log.at = Date.UTC(2026, 9, 18, 23, 1);
    log.add('message', bea, { text: 'tomorrow' });
    expect(plantOf(log.state(), 'aster').dew).toBe(5);
    expect(log.state().today.day).toBe('2026-10-19');
  });

  it('caps every plant separately, including the signature crop', () => {
    const log = newFarm();
    log.add('media', bea, { items: [photo] });
    log.add('media', bea, { items: [photo] });
    log.add('message', bea, { text: 'and words' });
    const state = log.state();
    expect(plantOf(state, 'chrysanthemum').dew).toBe(3);
    expect(plantOf(state, 'aster').dew).toBe(1);
    expect(plantOf(state, state.signature ?? '').dew).toBe(3);
  });

  it('scales thresholds as in the design: 3, 6, 12 and 24 active members', () => {
    expect(thresholdsFor(1)).toEqual({ sprout: 3, bud: 8, bloom: 15 });
    expect(thresholdsFor(3)).toEqual({ sprout: 3, bud: 8, bloom: 15 });
    expect(thresholdsFor(6)).toEqual({ sprout: 5, bud: 12, bloom: 22 });
    expect(thresholdsFor(12)).toEqual({ sprout: 6, bud: 16, bloom: 30 });
    expect(thresholdsFor(24)).toEqual({ sprout: 9, bud: 23, bloom: 43 });
    expect(kFor(2)).toBe(1);
    expect(kFor(12)).toBe(2);
  });

  it('reaches each stage at its threshold, and stops at bloom', () => {
    const t = thresholdsFor(3);
    expect([0, 2, 3, 7, 8, 14, 15, 99].map((d) => stageFromDew(d, t))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ]);
  });

  it('never lowers a plant when a new member raises k', () => {
    const people = ['p_a1', 'p_a2', 'p_a3', 'p_a4', 'p_a5', 'p_a6'];
    const log = newFarm({ members: people });
    // Three people tend the words plant to a sprout over a day.
    for (const person of people.slice(0, 3)) log.add('quiet_note', person, { text: 'hello' });
    expect(plantOf(log.state(), 'aster')).toMatchObject({ dew: 6, stage: 1 });
    expect(activeCount(log.state())).toBe(3);
    // Three more start tending other plants: k rises to √2 and the sprout needs 5.
    for (const person of people.slice(3)) log.add('dewdrop', person, {});
    expect(activeCount(log.state())).toBe(6);
    expect(plantOf(log.state(), 'aster').stage).toBe(1);
    expect(plantOf(log.state(), 'marigold')).toMatchObject({ dew: 3, stage: 0 });
  });

  it('blooms, records when, and finds the field guide page the first time', () => {
    const log = newFarm();
    for (let day = 0; day < 5; day++) {
      for (const person of [bea, pip, fig]) log.add('dewdrop', person, {});
      log.wait(DAY);
    }
    const state = log.state();
    const marigold = plantOf(state, 'marigold');
    expect(marigold.stage).toBe(3);
    expect(marigold.bloomedAt).toBe(T0 + 4 * DAY);
    expect(state.fieldGuide).toContainEqual({
      plant: 'marigold',
      variant: null,
      season: { season: 'autumn', year: 2026 },
      foundAt: T0 + 4 * DAY,
      via: 'grown',
    });
  });

  it('harvests every bloomed plant into the basket on harvest day; the rest rest', () => {
    const log = newFarm();
    for (let day = 0; day < 5; day++) {
      for (const person of [bea, pip, fig]) log.add('dewdrop', person, {});
      log.wait(DAY);
    }
    log.add('message', bea, { text: 'hi' });
    log.add('harvested', null, { season: 'autumn', year: 2026, day: '2026-11-29' });
    const state = log.state();
    expect(plantOf(state, 'marigold').stage).toBe(4);
    expect(plantOf(state, 'aster').stage).toBe(0);
    expect(state.basket).toEqual({
      season: { season: 'autumn', year: 2026 },
      crops: [
        { plant: 'marigold', variant: null },
        { plant: state.signature, variant: null },
      ],
    });
    // A harvest for another season changes nothing.
    log.add('harvested', null, { season: 'summer', year: 2026, day: '2026-08-30' });
    expect(log.state()).toEqual(state);
  });

  it('does not count tends of a capped person for k twice, and counts departed tenders', () => {
    const log = newFarm();
    log.add('dewdrop', bea, {});
    log.add('dewdrop', bea, {});
    log.add('left', bea, { how: 'left' });
    expect(activeCount(log.state())).toBe(1);
  });

  it('applies events without touching the state it was given', () => {
    const log = newFarm();
    const before = log.state();
    const copy = JSON.parse(JSON.stringify(before)) as FarmState;
    applyEvent(before, { ...log.add('dewdrop', bea, {}), at: T0 + HOUR });
    expect(before).toEqual(copy);
  });
});
