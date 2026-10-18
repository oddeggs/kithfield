import {
  type EventKind,
  type FarmKind,
  type FarmState,
  type SeasonRef,
} from '@kithfield/contracts';
import fc from 'fast-check';

import { SEASONS } from './catalog';
import {
  type Log,
  MINUTE,
  bea,
  critter,
  fig,
  june,
  kit,
  newFarm,
  otis,
  pip,
} from './farm.test-data';
import { localDay } from './time';

/* Random farm histories for the property tests: any mix of care, plans, presence and farm events. */

export const PEOPLE = [bea, pip, fig, kit, otis, june] as const;

const photo = {
  key: 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abc',
  mime: 'image/jpeg',
  bytes: 9,
};

/** Simple writes, by kind, given a friend and the time. */
const SIMPLE: [EventKind, (to: string, at: number) => object][] = [
  ['message', () => ({ text: 'hello' })],
  ['link', () => ({ url: 'https://example.com' })],
  ['quiet_note', () => ({ text: 'no reply needed' })],
  [
    'slow_post',
    (to, at) => ({ to, text: 'later', when: 'morning', deliverAt: at + 12 * 60 * MINUTE }),
  ],
  ['media', () => ({ items: [photo] })],
  ['sticker', () => ({ pack: 'mine', sticker: 'wave' })],
  ['voice', () => ({ audio: { ...photo, mime: 'audio/aac' }, durationMs: 900, waveform: [] })],
  ['fire', () => ({ state: 'sat' })],
  ['wave', () => ({})],
  ['knock', (to) => ({ to })],
  ['hug', (to) => ({ to })],
  ['dewdrop', () => ({})],
  ['dewdrop', (to) => ({ to })],
  ['scrapbook_page', () => ({ action: 'pressed', title: 'Picnic', items: [] })],
  ['reaction', () => ({ target: 1, reaction: 'sun' })],
  ['status', () => ({ status: 'words', text: 'out and about' })],
  ['farm_opened', () => ({})],
];

const act = fc.oneof(
  {
    weight: 30,
    arbitrary: fc.record({ t: fc.constant('simple' as const), i: fc.nat(SIMPLE.length - 1) }),
  },
  fc.record({
    t: fc.constant('seed' as const),
    place: fc.boolean(),
    yeses: fc.constantFrom('couple', 'most'),
  }),
  fc.record({
    t: fc.constant('vote' as const),
    seed: fc.nat(),
    option: fc.nat(2),
    on: fc.boolean(),
  }),
  fc.record({
    t: fc.constant('rsvp' as const),
    seed: fc.nat(),
    answer: fc.constantFrom('in', 'maybe', 'out'),
  }),
  fc.record({ t: fc.constant('checkin' as const), seed: fc.nat() }),
  fc.record({ t: fc.constant('hat' as const), seed: fc.nat() }),
  fc.record({ t: fc.constant('pin' as const), target: fc.nat(), on: fc.boolean() }),
  fc.record({ t: fc.constant('firefly' as const) }),
  fc.record({ t: fc.constant('openFirefly' as const), target: fc.nat() }),
  fc.record({ t: fc.constant('gift' as const), n: fc.nat(3) }),
  fc.record({ t: fc.constant('openGift' as const), n: fc.nat(3) }),
  fc.record({ t: fc.constant('gate' as const), gift: fc.boolean() }),
  fc.record({ t: fc.constant('trade' as const) }),
  fc.record({ t: fc.constant('birthday' as const) }),
  fc.record({ t: fc.constant('card' as const) }),
  fc.record({ t: fc.constant('hibernate' as const), on: fc.boolean() }),
  fc.record({ t: fc.constant('fire' as const), state: fc.constantFrom('lit', 'out') }),
  fc.record({ t: fc.constant('leave' as const), deleted: fc.boolean() }),
  fc.record({ t: fc.constant('join' as const) }),
  fc.record({ t: fc.constant('unsend' as const), target: fc.nat() }),
  fc.record({
    t: fc.constant('weather' as const),
    w: fc.constantFrom('rain', 'frost', 'heat', 'none'),
  }),
  fc.record({ t: fc.constant('rain' as const) }),
  fc.record({ t: fc.constant('harvest' as const) }),
  fc.record({ t: fc.constant('roll' as const) }),
);

export const step = fc.record({
  gap: fc.oneof(fc.nat(30), fc.nat(36 * 60)),
  who: fc.nat(PEOPLE.length - 1),
  to: fc.nat(PEOPLE.length - 1),
  act,
});
export type Step = typeof step extends fc.Arbitrary<infer S> ? S : never;

export const history = fc.record({
  kind: fc.constantFrom<FarmKind>('farm', 'farm', 'visit'),
  steps: fc.array(step, { minLength: 10, maxLength: 150, size: 'max' }),
});

const nextSeason = (s: SeasonRef): SeasonRef => {
  const i = SEASONS.indexOf(s.season);
  return {
    season: SEASONS[(i + 1) % 4] ?? 'spring',
    year: s.season === 'winter' ? s.year + 1 : s.year,
  };
};

/** Writes a random history as a farm log. Every event passes the strict event schema. */
export const buildLog = (kind: FarmKind, steps: readonly Step[]): Log => {
  const members = kind === 'visit' ? [june, otis] : [bea, pip, fig, kit];
  const log = newFarm({ kind, members });
  let season: SeasonRef = log.state().season;
  const seeds: number[] = [];
  const pick = (list: readonly number[], n: number) => list[n % list.length] ?? 999;
  for (const s of steps) {
    log.wait(s.gap * MINUTE);
    const who = PEOPLE[s.who] ?? bea;
    const to = PEOPLE[s.to] ?? pip;
    const day = localDay(log.at, 'Europe/London');
    const seqs = log.events.map((e) => e.seq);
    const a = s.act;
    switch (a.t) {
      case 'simple': {
        const [k, payload] = SIMPLE[a.i] ?? SIMPLE[0] ?? ['message', () => ({ text: 'hi' })];
        log.add(k, who, payload(to === who ? bea : to, log.at));
        break;
      }
      case 'seed':
        seeds.push(
          log.add('seed_planted', who, {
            title: 'Plan',
            days: [{ date: day }],
            place: a.place ? { name: 'Park' } : null,
            yeses: a.yeses,
            someday: false,
          }).seq,
        );
        break;
      case 'vote':
        log.add('vote', who, { seed: pick(seeds, a.seed), option: a.option, on: a.on });
        break;
      case 'rsvp':
        log.add('rsvp', who, { seed: pick(seeds, a.seed), answer: a.answer });
        break;
      case 'checkin':
        log.add('checkin', who, { seed: pick(seeds, a.seed) });
        break;
      case 'hat':
        log.add('seed_changed', who, {
          seed: pick(seeds, a.seed),
          hat: to,
        });
        break;
      case 'pin':
        log.add('pin', who, { target: pick(seqs, a.target), on: a.on });
        break;
      case 'firefly':
        log.add('firefly', who, { action: 'left', to, words: 'hi' });
        break;
      case 'openFirefly':
        log.add('firefly', who, { action: 'opened', target: pick(seqs, a.target) });
        break;
      case 'gift':
        log.add('gift', who, { action: 'given', gift: `g_${a.n}`, to, item: 'tea', wrap: 'kraft' });
        break;
      case 'openGift':
        log.add('gift', who, { action: 'opened', gift: `g_${a.n}` });
        break;
      case 'gate': {
        const visitor = { name: 'Visitor', critter };
        const gesture = a.gift
          ? { gesture: 'gift', gift: 'g_gate', to, item: 'jam', wrap: 'kraft' }
          : { gesture: 'firefly', to };
        log.add('gate', 'p_visitor', { visitor, gesture });
        break;
      }
      case 'trade':
        log.add('traded', who, {
          with: 'p_far',
          otherFarm: 'f_far',
          gave: null,
          got: { plant: 'fig', variant: 'sun_gold' },
        });
        break;
      case 'birthday':
        log.add('critter_changed', who, { birthday: day.slice(5) });
        break;
      case 'card':
        log.add('card_signed', who, { to, text: 'happy birthday' });
        break;
      case 'hibernate':
        log.add('hibernate', who, { on: a.on });
        break;
      case 'fire':
        log.add('fire', a.state === 'out' ? null : who, { state: a.state });
        break;
      case 'leave':
        log.add('left', who, { how: a.deleted ? 'account_deleted' : 'left' });
        break;
      case 'join':
        log.add('joined', who, { name: 'Again', critter, via: 'invite' });
        break;
      case 'unsend':
        log.add('unsend', who, { target: pick(seqs, a.target), by: 'author' });
        break;
      case 'weather':
        log.add('weather', null, { day, weather: a.w, source: 'weatherkit' });
        break;
      case 'rain':
        log.add('shared_rain', null, { day, people: [bea, pip, fig] });
        break;
      case 'harvest':
        log.add('harvested', null, { ...season, day });
        break;
      case 'roll':
        season = nextSeason(season);
        log.add('season_rolled', null, season);
        break;
    }
  }
  return log;
};

/** Everything a tombstone must leave the same: growth, and what the farm derives from facts. */
export const growthOf = (state: FarmState) => ({
  plants: state.plants,
  pot: state.pot,
  familyTendedAt: state.familyTendedAt,
  today: state.today,
  fieldGuide: state.fieldGuide,
  basket: state.basket,
  members: state.members,
  former: state.former,
  roses: state.roses,
  doorstep: state.doorstep,
  pins: state.pins,
  seeds: state.seeds,
  fireLitAt: state.fireLitAt,
});
