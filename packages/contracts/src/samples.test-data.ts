import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { type EventKind } from './events';
import { type Critter, type MediaRef } from './primitives';

/* Shared sample values for the contract tests. */

export const opId = '0192f1e2-3b4c-7d5e-8f60-123456789abc';
export const opId2 = '0192f1e2-3b4d-7a00-9f60-abcdefabcdef';
export const at = 1_792_000_000_000;
export const bea = 'p_bea';
export const pip = 'p_pip';
export const fig = 'p_fig';
export const farm = 'f_thursday_lot';

export const critter: Critter = {
  species: 'rabbit',
  coat: 'cocoa',
  mark: 'freckles',
  accessory: null,
  outfit: 'scarf',
  outfitColor: '#c96f4f',
  companion: null,
  cottage: null,
};

export const photo: MediaRef = {
  key: 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abc',
  mime: 'image/jpeg',
  bytes: 812_000,
  width: 2048,
  height: 1536,
};

export const voiceNote: MediaRef = {
  key: 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abd',
  mime: 'audio/aac',
  bytes: 120_000,
  durationMs: 42_000,
};

/** One valid payload per event kind, as the farm would store it. */
export const eventPayloads: Record<EventKind, object> = {
  message: { text: 'ok who is actually coming saturday', replyTo: 12, mentions: [bea] },
  edit: { target: 14, text: 'ok who is coming saturday?' },
  unsend: { target: 14, by: 'author' },
  reaction: { target: 14, reaction: 'sun' },
  sticker: { pack: 'mine', sticker: 'wave', with: [bea, pip] },
  media: { items: [photo], caption: 'allotment day' },
  voice: { audio: voiceNote, durationMs: 42_000, waveform: [0, 12, 200, 255] },
  link: {
    url: 'https://example.com/picnic',
    preview: { title: 'Willow bend', site: 'example.com' },
  },
  pin: { target: 14, on: true },
  dewdrop: { target: 14 },
  firefly: { action: 'left', to: bea, words: 'thinking of you' },
  wave: { to: pip },
  knock: { to: fig },
  hug: { to: fig, umbrella: true },
  quiet_note: { text: 'no need to reply, just glad you are here' },
  slow_post: { to: bea, text: 'a long letter', deliverAt: at + 36_000_000 },
  seed_planted: {
    seed: 'plan',
    fromSeq: 14,
    title: 'Picnic by the river',
    days: [{ date: '2026-10-24', from: '16:00' }, { date: '2026-10-25' }],
    place: { name: 'Willow bend', lat: 51.5, lng: -0.12 },
    yeses: 'most',
    someday: false,
  },
  seed_changed: { seed: 20, hat: bea, settleOn: '2026-10-22' },
  vote: { seed: 20, option: 1, on: true },
  rsvp: { seed: 20, answer: 'maybe' },
  checkin: { seed: 20 },
  gift: { action: 'given', gift: 'g_1', to: bea, item: 'pack.autumn_teas', wrap: 'kraft' },
  scrapbook_page: { action: 'pressed', title: 'Picnic by the river', seed: 20, items: [31, 32] },
  farm_opened: {},
  hibernate: { on: true },
  status: { status: 'words', text: 'off to the coast' },
  fire: { state: 'lit' },
  joined: { name: 'June', critter, via: 'invite' },
  left: { how: 'quietly' },
  removed: { person: fig, removeMedia: false, by: 'keeper' },
  critter_changed: { name: 'June', birthday: '04-12' },
  settings_changed: { setting: 'name', name: 'The Thursday Lot' },
  weather: { day: '2026-10-18', weather: 'rain', source: 'weatherkit' },
  shared_rain: { day: '2026-10-18', people: [bea, pip, fig] },
  season_rolled: { season: 'winter', year: 2026 },
  harvested: { season: 'autumn', year: 2026, day: '2026-11-29' },
  rules_changed: { from: 1, to: 2 },
  traded: { with: 'p_kit', otherFarm: 'f_fern_hollow', gave: 'lavender', got: 'plum' },
};

/** At least one invalid payload per event kind. */
export const badEventPayloads: Record<EventKind, object[]> = {
  message: [{ text: '' }, { text: '   ' }, { text: 'x'.repeat(4001) }],
  edit: [{ target: 0, text: 'x' }],
  unsend: [{ target: 3 }],
  reaction: [{ target: 3, reaction: 'thumbs_up' }],
  sticker: [{ pack: 'mine', sticker: 'wave', with: [bea, pip, fig, 'a', 'b'] }],
  media: [{ items: [] }],
  voice: [{ audio: voiceNote, durationMs: 300_001, waveform: [] }],
  link: [{ url: 'javascript:alert(1)' }],
  pin: [{ target: 3 }],
  dewdrop: [{ target: -1 }],
  firefly: [{ action: 'left' }, { action: 'opened' }],
  wave: [{ to: 'bad id!' }],
  knock: [{}],
  hug: [{ umbrella: 'yes' }],
  quiet_note: [{ text: '' }],
  slow_post: [{ to: bea, text: 'hi' }],
  seed_planted: [{ seed: 'plan', title: 'x', days: [], place: null, yeses: 'all', someday: false }],
  seed_changed: [{ seed: 20, settleOn: 'Thursday' }],
  vote: [{ seed: 20, option: 14, on: true }],
  rsvp: [{ seed: 20, answer: 'yes' }],
  checkin: [{}],
  gift: [{ action: 'given', gift: 'g_1', to: bea, item: 'Pack!', wrap: 'kraft' }],
  scrapbook_page: [{ action: 'pressed', title: 'x', items: Array.from({ length: 51 }, () => 1) }],
  farm_opened: [{ tombstone: 'gone' }],
  hibernate: [{}],
  status: [{ status: 'words', text: 'x'.repeat(41) }],
  fire: [{ state: 'roaring' }],
  joined: [{ name: 'June', critter: { ...critter, species: 'dragon' }, via: 'invite' }],
  left: [{ how: 'loudly' }],
  removed: [{ person: fig, removeMedia: true }],
  critter_changed: [{}],
  settings_changed: [{ setting: 'name', name: 'x'.repeat(33) }, { setting: 'colour' }],
  weather: [{ day: '2026-10-18', weather: 'snow', source: 'weatherkit' }],
  shared_rain: [{ day: '2026-10-18', people: [bea, pip] }],
  season_rolled: [{ season: 'monsoon', year: 2026 }],
  harvested: [{ season: 'autumn', year: 2026 }],
  rules_changed: [{ from: 2, to: 2 }],
  traded: [{ with: 'p_kit', otherFarm: 'f_fern_hollow', gave: null, got: 'Plum' }],
};

const plant = (id: string, stage: number) => ({
  plant: id,
  stage,
  dew: stage * 4,
  rare: null,
  bloomedAt: stage >= 3 ? at - 86_400_000 : null,
  credits: [{ person: bea, kinds: ['voice', 'fire'] }],
});

const member = (person: string, role: 'keeper' | 'helper' | 'critter') => ({
  person,
  name: person.slice(2),
  critter,
  role,
  joinedAt: at - 90 * 86_400_000,
  lastOpenedAt: at - 3_600_000,
  lastTendedAt: null,
  hibernating: false,
  paused: false,
  activeThisSeason: true,
  birthday: null,
  status: null,
  cloudAt: null,
  battery: 'open',
});

/** A farm in autumn: six family plants, the signature crop, a plan and a pin. */
export const farmState = {
  farm,
  kind: 'farm',
  name: 'The Thursday Lot',
  land: 'meadow',
  theme: null,
  place: {
    city: 'London',
    country: 'GB',
    timeZone: 'Europe/London',
    hemisphere: 'north',
    lat: 51.5,
    lng: -0.1,
  },
  birthdaysBloom: true,
  approval: false,
  frozen: false,
  rulesVersion: 1,
  season: { season: 'autumn', year: 2026 },
  weather: { day: '2026-10-18', weather: 'rain' },
  sharedRainDay: null,
  members: [member(bea, 'keeper'), member(pip, 'keeper'), member(fig, 'critter')],
  former: [{ person: 'p_old', name: null, critter, leftAt: at - 1000, how: 'account_deleted' }],
  plants: [
    plant('marigold', 1),
    plant('aster', 2),
    plant('chrysanthemum', 0),
    plant('heather', 3),
    plant('apple', 4),
    plant('pumpkin', 2),
    plant('plum', 1),
  ],
  signature: 'plum',
  familyTendedAt: {
    dew: at,
    words: at,
    pictures: null,
    voices: at - 1000,
    gestures: null,
    gatherings: at,
  },
  today: { day: '2026-10-18', given: [{ person: bea, plant: 'heather', dew: 3 }] },
  roses: [],
  pot: null,
  fieldGuide: [
    {
      plant: 'heather',
      variant: 'rain_kissed',
      season: { season: 'autumn', year: 2026 },
      foundAt: at,
      via: 'grown',
    },
  ],
  basket: null,
  seeds: [
    {
      seq: 20,
      planter: pip,
      title: 'Picnic by the river',
      days: [{ date: '2026-10-24', from: '16:00' }],
      place: { name: 'Willow bend' },
      yeses: 'most',
      someday: false,
      hat: pip,
      settleOn: null,
      votes: [{ option: 0, people: [bea, pip] }],
      rsvps: [{ person: fig, answer: 'maybe' }],
      checkins: [],
      sproutedAt: null,
    },
  ],
  pins: [14],
  fireLitAt: null,
};

/** A visit: two people, a porch pot and its pressed blooms, no field. */
export const visitState = {
  ...farmState,
  farm: 'f_visit_june_otis',
  kind: 'visit',
  name: 'June and Otis',
  members: [member(bea, 'critter'), member('p_otis', 'critter')],
  former: [],
  plants: [],
  signature: null,
  seeds: [],
  pins: [],
  fieldGuide: [],
  today: { day: '2026-10-18', given: [] },
  pot: {
    ...plant('cosmos', 2),
    pressed: [
      { season: { season: 'summer', year: 2026 }, plant: 'nasturtium', pressedAt: at - 9e9 },
    ],
  },
};

/** Every exported schema of the modules has samples: valid ones round-trip unchanged, invalid ones fail. */
export const describeSchemas = (
  title: string,
  modules: Record<string, unknown>,
  samples: Record<string, [valid: unknown[], invalid: unknown[]]>,
  skip: readonly string[] = [],
) =>
  describe(title, () => {
    const schemas = Object.entries(modules).filter(
      (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
    );

    it('has samples for every exported schema', () => {
      const names = schemas.map(([name]) => name);
      expect(names.filter((n) => !(n in samples) && !skip.includes(n))).toEqual([]);
    });

    it.each(schemas.filter(([name]) => name in samples))(
      '%s round-trips and rejects bad input',
      (name, schema) => {
        const [valid, invalid] = samples[name] ?? [[], []];
        for (const value of valid) {
          const parsed = schema.parse(value);
          expect(parsed).toEqual(value);
          expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
        }
        for (const value of invalid) {
          expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
        }
      },
    );
  });
