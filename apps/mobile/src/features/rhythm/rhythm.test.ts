import { describe, expect, it } from '@jest/globals';
import type { Species, WeeklyRecap } from '@kithfield/contracts';
import { farmView, type RestorationView } from '@kithfield/farm';
import { translator } from '@kithfield/i18n';

import type { StoredEvent } from '../../data';
import { DAY, farmLog } from '../farm/farm-log.test-data';
import { birthdayBloom } from './birthday';
import { handText, inSentence, rainNames, say } from './copy';
import { gateOps, outcomeOf } from './gate-gestures';
import { sharedRainToday, showSharedRain, todayWeather, weatherKind } from './moments';
import { captionKey, progressKey } from './project-copy';
import { recapCopy, reasonKey } from './recap-copy';
import { pressableHangouts, pressedArt, snapArt } from './scrapbook-model';

const en = translator('en');
const vi = translator('vi');

const members: [string, Species][] = [
  ['p_bea', 'rabbit'],
  ['p_pip', 'hedgehog'],
  ['p_fig', 'frog'],
  ['p_mo', 'mole'],
];

const stored = (seq: number, kind: string, payload: unknown, day: string): StoredEvent => ({
  seq,
  opId: `0192f1e2-3b4c-7d5e-8f60-${seq.toString(16).padStart(12, '0')}`,
  at: 0,
  day,
  actor: null,
  kind,
  payload,
  rulesVersion: 4,
  known: true,
});

describe('a birthday bloom', () => {
  it('opens on the day, with everyone who watered or signed named once', () => {
    const log = farmLog(members);
    log.add('critter_changed', 'p_bea', { birthday: '10-18' });
    log.add('dewdrop', 'p_pip', { to: 'p_bea' });
    log.add('card_signed', 'p_pip', { to: 'p_bea', text: 'happy day' });
    log.add('card_signed', 'p_fig', { to: 'p_bea', text: 'x' });
    const state = log.state();
    const view = farmView(state, log.at);
    expect(birthdayBloom(state, view, 'p_bea', 'p_pip')).toEqual({
      person: 'p_bea',
      name: 'bea',
      you: false,
      petals: ['p_pip', 'p_fig'],
      watered: true,
      signed: true,
    });
    expect(birthdayBloom(state, view, 'p_bea', 'p_bea')?.you).toBe(true);
    // The next day the bloom has closed.
    expect(birthdayBloom(state, farmView(state, log.at + DAY), 'p_bea', 'p_pip')).toBeNull();
    expect(birthdayBloom(state, view, 'p_mo', 'p_pip')).toBeNull();
  });
});

describe('shared rain and the weather', () => {
  it('shows shared rain once a day to the people it rained on', () => {
    const log = farmLog(members);
    log.add('shared_rain', null, { day: '2026-10-18', people: ['p_bea', 'p_pip', 'p_fig'] });
    const view = farmView(log.state(), log.at);
    const events = [
      stored(
        9,
        'shared_rain',
        { day: '2026-10-18', people: ['p_bea', 'p_pip', 'p_fig'] },
        '2026-10-18',
      ),
    ];
    const people = sharedRainToday(events, view.today);
    expect(people).toEqual(['p_bea', 'p_pip', 'p_fig']);
    expect(showSharedRain(view, people, 'p_pip', null)).toBe(true);
    expect(showSharedRain(view, people, 'p_pip', '2026-10-18')).toBe(false);
    expect(showSharedRain(view, people, 'p_mo', null)).toBe(false);
    expect(sharedRainToday(events, '2026-10-19')).toBeNull();
  });

  it('reads today’s weather and its source from the keeper’s town', () => {
    const log = farmLog(members);
    log.add('settings_changed', 'p_bea', {
      setting: 'place',
      place: { city: 'Hollow Creek', country: 'GB', lat: 51.5, lng: -0.1 },
    });
    log.add('weather', null, { day: '2026-10-18', weather: 'rain', source: 'weatherkit' });
    const state = log.state();
    const view = farmView(state, log.at);
    const events = [
      stored(
        9,
        'weather',
        { day: '2026-10-18', weather: 'rain', source: 'weatherkit' },
        '2026-10-18',
      ),
    ];
    expect(todayWeather(state, view, events)).toEqual({
      weather: 'rain',
      city: 'Hollow Creek',
      source: 'weatherkit',
    });
    expect(todayWeather(state, view, [])?.source).toBeNull();
    expect(todayWeather(state, farmView(state, log.at + DAY), events)).toBeNull();
  });

  it('shows a calm farm without weather, never a made-up rain', () => {
    expect(weatherKind({ weather: 'frost', city: 'Leeds', source: null }, true)).toBe('frost');
    expect(weatherKind(null, true)).toBe('none');
    expect(weatherKind(null, false)).toBe('noTown');
  });
});

describe('the restoration project’s words', () => {
  const at = (over: Partial<RestorationView>): RestorationView => ({
    project: 'greenhouse',
    scene: 'barn',
    step: 17,
    steps: 28,
    progress: 17 / 28,
    finished: false,
    stepsTonight: true,
    progressTonight: 18 / 28,
    done: [],
    ...over,
  });

  it('says roughly how far along it is, never a number', () => {
    expect(progressKey(0)).toBe('rhythm.project.progress.0');
    expect(progressKey(0.62)).toBe('rhythm.project.progress.4');
    expect(progressKey(1)).toBe('rhythm.project.progress.6');
    for (let i = 0; i <= 28; i++) expect(say(en, progressKey(i / 28))).not.toMatch(/\d/);
  });

  it('previews tonight from whether anyone tended today', () => {
    expect(captionKey(at({}), 'today')).toBe('rhythm.project.progress.4');
    expect(captionKey(at({}), 'tonight')).toBe('rhythm.project.tonight.step');
    expect(captionKey(at({ stepsTonight: false }), 'tonight')).toBe(
      'rhythm.project.tonight.waiting',
    );
    expect(captionKey(at({ step: 27, progressTonight: 1 }), 'tonight')).toBe(
      'rhythm.project.tonight.last',
    );
    expect(captionKey(at({ finished: true }), 'today')).toBe('rhythm.project.done');
  });
});

describe('the Sunday harvest', () => {
  const recap = (over: Partial<WeeklyRecap>): WeeklyRecap => ({
    farm: 'f_lot',
    week: '2026-10-18',
    pollinator: { person: 'p_pip', reason: 'checked_on_everyone' },
    thanks: [
      { person: 'p_pip', kinds: ['dewdrop', 'message', 'wave'] },
      { person: 'p_bea', kinds: ['media', 'message'] },
      { person: 'p_mo', kinds: ['quiet_note'] },
      { person: 'p_otis', kinds: ['dewdrop'] },
    ],
    plans: [41],
    letterState: 'none',
    letter: null,
    ...over,
  });
  const names: Record<string, string> = { p_pip: 'Pip', p_bea: 'Bea', p_mo: 'Mo', p_otis: 'Otis' };
  const nameOf = (p: string) => names[p] ?? 'a friend';

  it('writes its own letter from kinds of care, thanking quiet friends, with no numbers', () => {
    const copy = recapCopy(en, recap({}), 'the Thursday Lot', nameOf);
    expect(copy.title).toBe('A good week on the Thursday Lot');
    expect(copy.body).toBe('A plan planted, a pile of photos and notes back and forth.');
    expect(copy.pollinator).toEqual({
      person: 'p_pip',
      reason: 'Checked in on every single critter this week.',
    });
    // Quiet care first: Mo's quiet notes and Otis's dewdrops, before Bea's photos.
    expect(copy.thanks?.people).toEqual(['p_mo', 'p_otis']);
    expect(copy.thanks?.line).toBe('Mo’s quiet notes and Otis’s dewdrops kept things warm too.');
    expect(copy.byAi).toBe(false);
    expect(`${copy.title} ${copy.body} ${copy.thanks?.line}`).not.toMatch(/\d/);
  });

  it('uses the AI letter only once it is written, and falls back for an unknown reason', () => {
    const written = recapCopy(
      en,
      recap({
        letterState: 'written',
        letter: { lang: 'en', title: 'Picnic week', body: 'You all came.' },
        pollinator: { person: 'p_bea', reason: 'danced_in_the_rain' },
      }),
      'the Lot',
      nameOf,
    );
    expect(written).toMatchObject({ title: 'Picnic week', body: 'You all came.', byAi: true });
    expect(written.pollinator?.reason).toBe(say(en, reasonKey('danced_in_the_rain')));
    expect(recapCopy(vi, recap({ thanks: [], plans: [] }), 'Lô', nameOf).body).toBe(
      vi('rhythm.recap.restful'),
    );
  });
});

describe('the scrapbook', () => {
  it('draws the same pressed flower and snapshot for a page every time', () => {
    expect(pressedArt('lavender', 7)).toBe('lavender');
    expect(pressedArt('pumpkin', 7)).toBe(pressedArt('pumpkin', 7));
    expect(['daisy', 'poppy', 'clover', 'lavender', 'fern']).toContain(pressedArt(null, 9));
    expect(snapArt(12)).toBe(snapArt(12));
  });

  it('offers a sprouted hangout whose day has come, with that day’s photos, until it is pressed', () => {
    const log = farmLog(members);
    log.add('seed_planted', 'p_bea', {
      title: 'Picnic',
      days: [{ date: '2026-10-18' }],
      place: { name: 'The river' },
      yeses: 'couple',
      someday: false,
    });
    log.add('rsvp', 'p_pip', { seed: 6, answer: 'in' });
    log.add('rsvp', 'p_fig', { seed: 6, answer: 'in' });
    const state = log.state();
    const sprouted = state.seeds[0];
    expect(sprouted?.sproutedAt).not.toBeNull();
    const events = [
      stored(20, 'media', {}, '2026-10-18'),
      stored(21, 'reaction', {}, '2026-10-18'),
      stored(22, 'voice', {}, '2026-10-17'),
    ];
    const [hangout] = pressableHangouts(state, [], events, '2026-10-19');
    expect(hangout).toMatchObject({ day: '2026-10-18', items: [20], flower: 'pumpkin' });
    expect(pressableHangouts(state, [{ seed: 6 }], events, '2026-10-19')).toEqual([]);
    expect(pressableHangouts(state, [], events, '2026-10-17')).toEqual([]);
    // Pressed once, a hangout isn't offered again after its page is hidden.
    const pressedPage = stored(23, 'scrapbook_page', { action: 'pressed', seed: 6 }, '2026-10-18');
    expect(pressableHangouts(state, [], [...events, pressedPage], '2026-10-19')).toEqual([]);
  });
});

describe('gestures at a friend’s gate', () => {
  it('says why one was turned away', () => {
    const op = '0192f1e2-3b4c-7d5e-8f60-000000000001';
    expect(outcomeOf({ result: 'ack', opId: op, seq: 4 })).toEqual({ ok: true });
    expect(outcomeOf({ result: 'rejected', opId: op, reason: 'limit_reached' })).toEqual({
      ok: false,
      message: 'rhythm.visit.oncePerDay',
    });
    expect(outcomeOf({ result: 'rejected', opId: op, reason: 'not_member' })).toMatchObject({
      gone: true,
    });
  });
});

describe('words the rhythm screens put together', () => {
  it('puts you into the list of who is under the shared rain, in both languages', () => {
    expect(rainNames(en, ['Pip', 'Fig', 'Bea'], true)).toBe('Pip, Fig, Bea and you');
    expect(rainNames(en, ['Pip'], true)).toBe('Pip and you');
    expect(rainNames(en, ['Pip', 'Fig', 'Bea'], false)).toBe('Pip, Fig and Bea');
    expect(rainNames(vi, ['Pip', 'Fig'], true)).toBe('Pip, Fig và bạn');
  });

  it('keeps a farm name that starts with "The" lower case mid-sentence in English', () => {
    expect(inSentence('The Thursday Lot', 'en')).toBe('the Thursday Lot');
    expect(inSentence('Fern Hollow', 'en')).toBe('Fern Hollow');
    expect(inSentence('The Lot', 'vi')).toBe('The Lot');
  });

  it('writes the hand-lettered face with a straight apostrophe', () => {
    expect(handText('Pip’s at the gate')).toBe("Pip's at the gate");
  });
});

describe('one op id per gesture at a gate', () => {
  it('reuses a gesture’s op id until the farm has answered it', () => {
    let n = 0;
    const ops = gateOps(() => `op-${++n}`);
    expect(ops.idFor('wave')).toBe('op-1');
    // Sent but unanswered (offline, a timeout): the retry carries the same op id.
    expect(ops.idFor('wave')).toBe('op-1');
    expect(ops.idFor('firefly')).toBe('op-2');
    ops.answered('wave');
    expect(ops.idFor('wave')).toBe('op-3');
  });
});
