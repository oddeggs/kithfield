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
  message: {
    text: 'ok who is actually coming saturday',
    replyTo: 12,
    mentions: [bea],
    forwardedFrom: { farm: 'f_book_club', seq: 7 },
  },
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
  hug: { to: fig, umbrella: true, warmth: 'soup' },
  quiet_note: { text: 'no need to reply, just glad you are here' },
  slow_post: { to: bea, text: 'a long letter', when: 'morning', deliverAt: at + 36_000_000 },
  card_signed: { to: bea, text: 'happy birthday, Bea!' },
  gate: {
    visitor: { name: 'Kit', critter: { ...critter, species: 'fox' } },
    gesture: { gesture: 'gift', gift: 'g_2', to: bea, item: 'jam.plum', wrap: 'kraft' },
  },
  seed_planted: {
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
  left: { how: 'left' },
  removed: { person: fig, removeMedia: false, by: 'keeper' },
  critter_changed: { name: 'June', birthday: '04-12' },
  settings_changed: { setting: 'name', name: 'The Thursday Lot' },
  weather: { day: '2026-10-18', weather: 'rain', source: 'weatherkit' },
  shared_rain: { day: '2026-10-18', people: [bea, pip, fig] },
  season_rolled: { season: 'winter', year: 2026 },
  harvested: { season: 'autumn', year: 2026, day: '2026-11-29' },
  rules_changed: { from: 1, to: 2 },
  traded: { with: 'p_kit', otherFarm: 'f_fern_hollow', gave: 'lavender', got: 'plum' },
  farm_created: {
    kind: 'farm',
    name: 'The Thursday Lot',
    land: 'meadow',
    timeZone: 'Europe/London',
    hemisphere: 'north',
  },
  restored: { target: 41 },
};

/** At least one invalid payload per event kind. */
export const badEventPayloads: Record<EventKind, unknown[]> = {
  message: [
    { text: '' },
    { text: '   ' },
    { text: 'x'.repeat(4001) },
    { text: 'hi', forwardedFrom: { farm: 'f_book_club' } },
  ],
  edit: [{ target: 0, text: 'x' }],
  unsend: [{ target: 3 }],
  reaction: [
    { target: 3, reaction: 'thumbs_up' },
    { target: 3, reaction: 'dewdrop' },
  ],
  sticker: [{ pack: 'mine', sticker: 'wave', with: [bea, pip, fig, 'a', 'b'] }],
  media: [{ items: [] }],
  voice: [{ audio: voiceNote, durationMs: 300_001, waveform: [] }],
  link: [{ url: 'javascript:alert(1)' }],
  pin: [{ target: 3 }],
  dewdrop: [{ target: -1 }, { target: 14, to: bea }],
  firefly: [{ action: 'left' }, { action: 'opened' }],
  wave: [{ to: 'bad id!' }],
  knock: [{}],
  hug: [{ umbrella: 'yes' }, { umbrella: true }, { to: fig, warmth: 'tea' }],
  quiet_note: [{ text: '' }],
  slow_post: [
    { to: bea, text: 'hi', when: 'morning' },
    { to: bea, text: 'hi', when: 'soon', deliverAt: at },
  ],
  card_signed: [{ to: bea, text: 'x'.repeat(201) }, { text: 'hi' }],
  gate: [
    { visitor: { name: 'Kit', critter }, gesture: { gesture: 'hug' } },
    { gesture: { gesture: 'wave' } },
  ],
  seed_planted: [
    { title: 'x', days: [], place: null, yeses: 'all', someday: false },
    { title: 'Bea interview', about: bea, nudgeAt: at },
  ],
  seed_changed: [{ seed: 20, settleOn: 'Thursday' }],
  vote: [{ seed: 20, option: 14, on: true }],
  rsvp: [{ seed: 20, answer: 'yes' }],
  checkin: [{}],
  gift: [{ action: 'given', gift: 'g_1', to: bea, item: 'Pack!', wrap: 'kraft' }],
  scrapbook_page: [{ action: 'pressed', title: 'x', items: Array.from({ length: 51 }, () => 1) }],
  farm_opened: [null, 'opened'],
  hibernate: [{}],
  status: [{ status: 'words', text: 'x'.repeat(41) }],
  fire: [{ state: 'roaring' }],
  joined: [{ name: 'June', critter: { ...critter, species: 'dragon' }, via: 'invite' }],
  left: [{ how: 'loudly' }, { how: 'removed' }, { how: 'quietly' }],
  removed: [{ person: fig, removeMedia: true }],
  critter_changed: [{}],
  settings_changed: [
    { setting: 'name', name: 'x'.repeat(33) },
    { setting: 'colour' },
    { setting: 'calendar', timeZone: 'London', hemisphere: 'north' },
  ],
  weather: [{ day: '2026-10-18', weather: 'snow', source: 'weatherkit' }],
  shared_rain: [{ day: '2026-10-18', people: [bea, pip] }],
  season_rolled: [{ season: 'monsoon', year: 2026 }],
  harvested: [{ season: 'autumn', year: 2026 }],
  rules_changed: [{ from: 2, to: 2 }],
  traded: [{ with: 'p_kit', otherFarm: 'f_fern_hollow', gave: null, got: 'Plum' }],
  farm_created: [
    { kind: 'visit', name: 'Us', land: 'meadow', timeZone: 'UTC', hemisphere: 'north' },
    { kind: 'farm', name: null, land: 'meadow', timeZone: 'UTC', hemisphere: 'north' },
    { kind: 'farm', name: 'x', land: 'meadow', timeZone: 'UTC', hemisphere: 'up' },
  ],
  restored: [{ target: 0 }, {}],
};
