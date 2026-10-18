import { EVENT_KINDS, type EventKind, type PersonId } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import model from '../../../docs/farm-model.md?raw';
import { PORCH_POT } from './catalog';
import {
  DAY,
  HOUR,
  T0,
  bea,
  critter,
  expectSnapshot,
  fig,
  june,
  newFarm,
  otis,
  pip,
  plantOf,
} from './farm.test-data';
import { thresholdsOf } from './growth';
import { STAGE } from './rules';
import { farmView } from './view';

const photo = {
  key: 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abc',
  mime: 'image/jpeg',
  bytes: 9,
};
const visitor = { name: 'Kit', critter };

/** One event of every kind, as actor and payload, aimed at what the farm below already holds. */
const samples: Record<EventKind, [PersonId | null, object]> = {
  message: [bea, { text: 'hello' }],
  edit: [bea, { target: 5, text: 'hello again' }],
  unsend: [bea, { target: 5, by: 'author' }],
  reaction: [pip, { target: 5, reaction: 'sun' }],
  sticker: [pip, { pack: 'mine', sticker: 'wave' }],
  media: [pip, { items: [photo] }],
  voice: [pip, { audio: { ...photo, mime: 'audio/aac' }, durationMs: 900, waveform: [3] }],
  link: [pip, { url: 'https://example.com' }],
  pin: [pip, { target: 5, on: true }],
  dewdrop: [fig, { to: bea }],
  firefly: [fig, { action: 'left', to: bea, words: 'hi' }],
  wave: [fig, {}],
  knock: [fig, { to: bea }],
  hug: [fig, { to: bea, umbrella: true, warmth: 'soup' }],
  quiet_note: [fig, { text: 'no reply needed' }],
  slow_post: [fig, { to: bea, text: 'later', when: 'morning', deliverAt: T0 + DAY }],
  card_signed: [pip, { to: bea, text: 'happy birthday' }],
  gate: ['p_kit', { visitor, gesture: { gesture: 'firefly', to: bea } }],
  seed_planted: [bea, { title: 'Picnic', days: [], place: null, yeses: 'couple', someday: false }],
  seed_changed: [bea, { seed: 6, title: 'Picnic by the river' }],
  vote: [pip, { seed: 6, option: 0, on: true }],
  rsvp: [pip, { seed: 6, answer: 'in' }],
  checkin: [pip, { seed: 6 }],
  gift: [pip, { action: 'given', gift: 'g_1', to: fig, item: 'tea', wrap: 'kraft' }],
  scrapbook_page: [pip, { action: 'pressed', title: 'Picnic', items: [5] }],
  traded: [
    bea,
    { with: 'p_kit', otherFarm: 'f_other', gave: null, got: { plant: 'plum', variant: null } },
  ],
  farm_opened: [fig, {}],
  hibernate: [fig, { on: true }],
  status: [fig, { status: 'words', text: 'at the allotment' }],
  fire: [null, { state: 'out' }],
  joined: ['p_new', { name: 'New', critter, via: 'invite' }],
  left: [fig, { how: 'left' }],
  removed: [null, { person: pip, removeMedia: false, by: 'safety' }],
  critter_changed: [bea, { birthday: '10-18' }],
  settings_changed: [null, { setting: 'paused', person: fig, until: T0 + DAY }],
  farm_created: [
    null,
    {
      farm: 'f_other',
      kind: 'farm',
      name: 'Other',
      land: 'meadow',
      timeZone: 'UTC',
      hemisphere: 'north',
    },
  ],
  weather: [null, { day: '2026-10-18', weather: 'rain', source: 'weatherkit' }],
  shared_rain: [null, { day: '2026-10-18', people: [bea, pip, fig] }],
  season_rolled: [null, { season: 'winter', year: 2026 }],
  harvested: [null, { season: 'autumn', year: 2026, day: '2026-11-29' }],
  rules_changed: [null, { from: 1, to: 2 }],
  restored: [null, { target: 5 }],
};

/** The kinds named in the doc's event log table, by group. */
const tableKinds = () => {
  const section = model.slice(model.indexOf('## 2. Event log'), model.indexOf('## 3.'));
  const rows = [
    ...section.matchAll(
      /^\| (Chat|Gestures|Plans|Keepsakes|Presence|Membership|Written by the farm) \|(.*)\|$/gm,
    ),
  ];
  return rows.flatMap((row) => [...(row[2] ?? '').matchAll(/`([a-z_]+)`/g)].map((m) => m[1] ?? ''));
};

describe('Event log (Farm Durable Object, SQLite): the kinds table', () => {
  it('names exactly the kinds the reducer knows', () => {
    expect(new Set(tableKinds())).toEqual(new Set(EVENT_KINDS));
  });

  it.each(tableKinds())('%s applies and leaves a valid snapshot', (kind) => {
    const log = newFarm();
    log.add('message', bea, { text: 'the fifth event' });
    log.add('seed_planted', bea, {
      title: 'Picnic',
      days: [{ date: '2026-10-18' }],
      place: null,
      yeses: 'couple',
      someday: false,
    });
    const [actor, payload] = samples[kind as EventKind];
    log.add(kind as EventKind, actor, payload);
    expectSnapshot(log.state());
  });
});

describe('Sleepy and awake (computed)', () => {
  it('Critter: sleepy after 4 days without farm_opened, hibernating or paused; awake on opening', () => {
    const log = newFarm();
    log.add('farm_opened', bea, {});
    const critterOf = (now: number) =>
      farmView(log.state(), now).critters.find((c) => c.person === bea);
    expect(critterOf(log.at + 4 * DAY - HOUR)?.sleepy).toBe(false);
    expect(critterOf(log.at + 4 * DAY + HOUR)?.sleepy).toBe(true);
    log.wait(5 * DAY).add('farm_opened', bea, {});
    expect(critterOf(log.at)?.sleepy).toBe(false);
    log.add('hibernate', bea, { on: true });
    expect(critterOf(log.at)).toMatchObject({ sleepy: true, hibernating: true });
    log.add('hibernate', bea, { on: false });
    log.add('settings_changed', null, { setting: 'paused', person: bea, until: log.at + DAY });
    expect(critterOf(log.at)).toMatchObject({ sleepy: true, paused: true });
    expect(critterOf(log.at + DAY + 1)).toMatchObject({ sleepy: false, paused: false });
  });

  it('Critter: opening a firefly left for them wakes them', () => {
    const log = newFarm();
    const firefly = log.add('firefly', pip, { action: 'left', to: bea });
    log.wait(6 * DAY);
    expect(farmView(log.state(), log.at).critters.find((c) => c.person === bea)?.sleepy).toBe(true);
    log.add('firefly', bea, { action: 'opened', target: firefly.seq });
    expect(farmView(log.state(), log.at).critters.find((c) => c.person === bea)?.sleepy).toBe(
      false,
    );
    expect(log.state().doorstep).toEqual([]);
  });

  it('Plant: sleepy after 7 days without a tend of its family (14 in winter); any tend wakes it', () => {
    const log = newFarm();
    log.add('message', bea, { text: 'hi' });
    const aster = (now: number) =>
      farmView(log.state(), now).plants.find((p) => p.plant === 'aster');
    expect(aster(log.at + 7 * DAY - HOUR)?.sleepy).toBe(false);
    expect(aster(log.at + 7 * DAY + HOUR)?.sleepy).toBe(true);
    log.wait(8 * DAY).add('link', pip, { url: 'https://example.com' });
    expect(aster(log.at)?.sleepy).toBe(false);
    log.at = Date.UTC(2026, 11, 1, 9);
    log.add('season_rolled', null, { season: 'winter', year: 2026 });
    log.add('message', fig, { text: 'snow!' });
    const jasmine = (now: number) =>
      farmView(log.state(), now).plants.find((p) => p.plant === 'jasmine');
    expect(jasmine(log.at + 13 * DAY)?.sleepy).toBe(false);
    expect(jasmine(log.at + 15 * DAY)?.sleepy).toBe(true);
  });

  it('Farm: misty after 14 days with no farm_opened from anyone; anyone opening lifts it', () => {
    const log = newFarm();
    expect(farmView(log.state(), log.at + 14 * DAY - HOUR).misty).toBe(false);
    expect(farmView(log.state(), log.at + 14 * DAY + HOUR).misty).toBe(true);
    log.wait(20 * DAY).add('farm_opened', fig, {});
    expect(farmView(log.state(), log.at).misty).toBe(false);
  });
});

describe('Changes from the design', () => {
  it('six families, one plant per family per season', () => {
    expect(newFarm().state().plants).toHaveLength(7);
  });

  it('thresholds scale with members active this season', () => {
    const people = Array.from({ length: 12 }, (_, i) => `p_m${i}`);
    const log = newFarm({ members: people });
    expect(thresholdsOf(log.state()).bloom).toBe(15);
    for (const person of people) log.add('dewdrop', person, {});
    expect(thresholdsOf(log.state()).bloom).toBe(30);
  });

  it('3 dew per person per plant per day for every plant, replies and dewdrops alike', () => {
    const log = newFarm();
    for (let i = 0; i < 5; i++) log.add('dewdrop', bea, { target: 4 });
    expect(plantOf(log.state(), 'marigold').dew).toBe(3);
  });

  it('stage 0–4 plus a computed sleepy flag, never a stage', () => {
    expect(STAGE).toEqual({ seed: 0, sprout: 1, bud: 2, bloom: 3, harvest: 4 });
    const plant = farmView(newFarm().state(), T0 + 30 * DAY).plants[0];
    expect(plant).toMatchObject({ stage: 0, sleepy: true });
  });

  it('a porch pot per visit, with the same cap and k = 1, pressed into its own scrapbook', () => {
    const log = newFarm({ kind: 'visit' });
    expect(log.state().pot?.plant).toBe(PORCH_POT.autumn);
    expect(log.state().plants).toEqual([]);
    for (let day = 0; day < 3; day++) {
      // Any tend grows the pot; families don't matter.
      log.add('voice', june, {
        audio: { ...photo, mime: 'audio/aac' },
        durationMs: 900,
        waveform: [],
      });
      log.add('voice', june, {
        audio: { ...photo, mime: 'audio/aac' },
        durationMs: 900,
        waveform: [],
      });
      log.add('message', otis, { text: 'and mine' });
      log.add('dewdrop', otis, {});
      log.add('wave', otis, {});
      log.wait(DAY);
    }
    expect(plantOf(log.state(), 'cosmos')).toMatchObject({ dew: 18, stage: STAGE.bloom });
    expect(thresholdsOf(log.state())).toEqual({ sprout: 3, bud: 8, bloom: 15 });
    log.add('harvested', null, { season: 'autumn', year: 2026, day: '2026-11-29' });
    expect(log.state().pot?.pressed).toEqual([
      { season: { season: 'autumn', year: 2026 }, plant: 'cosmos', pressedAt: log.at },
    ]);
    expect(log.state().fieldGuide).toEqual([]);
    // The pot's bloom never goes in a basket; the empty basket only marks the harvest.
    expect(log.state().basket).toEqual({ season: { season: 'autumn', year: 2026 }, crops: [] });
    log.add('season_rolled', null, { season: 'winter', year: 2026 });
    expect(log.state().pot).toMatchObject({ plant: 'paperwhite', stage: 0, dew: 0 });
    expect(log.state().pot?.pressed).toHaveLength(1);
    expectSnapshot(log.state());
  });

  it('reactions grow nothing; the dewdrop in the reaction row is the tend', () => {
    const log = newFarm();
    log.add('reaction', bea, { target: 4, reaction: 'heart' });
    expect(log.state().plants.every((p) => p.dew === 0)).toBe(true);
    log.add('dewdrop', bea, { target: 4 });
    expect(plantOf(log.state(), 'marigold').dew).toBe(1);
  });

  it('remember-me seeds never reach the farm log', () => {
    expect(EVENT_KINDS.some((kind) => kind.includes('remember'))).toBe(false);
  });
});
