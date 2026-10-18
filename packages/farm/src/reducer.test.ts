import { parseEvent } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import {
  DAY,
  HOUR,
  T0,
  bea,
  critter,
  expectSnapshot,
  fig,
  kit,
  newFarm,
  pip,
  plantOf,
} from './farm.test-data';
import { applyRestored } from './plans';
import { applyEvent, applyParsed, replay } from './reducer';
import { farmView } from './view';

const plan = {
  title: 'Picnic',
  days: [{ date: '2026-10-24' }],
  place: null,
  yeses: 'couple',
  someday: false,
};

describe('farm identity', () => {
  it('starts from farm_created with the six plants and the signature crop', () => {
    const state = newFarm({ members: [] }).state();
    expect(state).toMatchObject({
      farm: 'f_thursday_lot',
      kind: 'farm',
      name: 'The Thursday Lot',
      timeZone: 'Europe/London',
      season: { season: 'autumn', year: 2026 },
      today: { day: '2026-10-18', given: [] },
      signature: 'lemon',
      pot: null,
    });
    expect(state.plants.map((p) => p.plant)).toEqual([
      ...['marigold', 'aster', 'chrysanthemum', 'heather', 'apple', 'pumpkin'],
      'lemon',
    ]);
    expectSnapshot(state);
    expect(replay([])).toBeNull();
  });

  it('makes the creator a keeper and everyone else a critter', () => {
    const roles = newFarm()
      .state()
      .members.map((m) => [m.person, m.role]);
    expect(roles).toEqual([
      [bea, 'keeper'],
      [pip, 'critter'],
      [fig, 'critter'],
    ]);
  });
});

describe('plans', () => {
  it('sprouts once it has a day, a place and enough yeses', () => {
    const log = newFarm();
    const seed = log.add('seed_planted', bea, plan);
    log.add('rsvp', bea, { seed: seed.seq, answer: 'in' });
    log.add('rsvp', pip, { seed: seed.seq, answer: 'maybe' });
    expect(log.state().seeds[0]?.sproutedAt).toBeNull();
    log.add('seed_changed', bea, { seed: seed.seq, place: { name: 'Willow bend' } });
    log.add('rsvp', pip, { seed: seed.seq, answer: 'in' });
    const sprouted = log.state().seeds[0];
    expect(sprouted).toMatchObject({
      sproutedAt: log.at,
      rsvps: [
        { person: bea, answer: 'in' },
        { person: pip, answer: 'in' },
      ],
    });
    expect(farmView(log.state(), log.at).plans[0]?.stage).toBe(3);
    // Sprouting never goes back.
    log.add('rsvp', pip, { seed: seed.seq, answer: 'out' });
    expect(log.state().seeds[0]?.sproutedAt).toBe(sprouted?.sproutedAt);
  });

  it('counts votes per day option, and takes them back', () => {
    const log = newFarm();
    const seed = log.add('seed_planted', bea, {
      ...plan,
      days: [{ date: '2026-10-24' }, { date: '2026-10-25' }],
    });
    log.add('vote', pip, { seed: seed.seq, option: 1, on: true });
    log.add('vote', fig, { seed: seed.seq, option: 1, on: true });
    log.add('vote', fig, { seed: seed.seq, option: 0, on: true });
    log.add('vote', pip, { seed: seed.seq, option: 1, on: false });
    expect(log.state().seeds[0]?.votes).toEqual([
      { option: 0, people: [fig] },
      { option: 1, people: [fig] },
    ]);
  });

  it('passes the hat, and gives it back to the planter when its wearer leaves', () => {
    const log = newFarm();
    const seed = log.add('seed_planted', bea, plan);
    log.add('seed_changed', bea, { seed: seed.seq, hat: pip });
    expect(log.state().seeds[0]?.hat).toBe(pip);
    log.add('left', pip, { how: 'left' });
    expect(log.state().seeds[0]?.hat).toBe(bea);
  });

  it('puts an unsent plan back when an appeal restores it', () => {
    const log = newFarm();
    const seed = log.add('seed_planted', bea, plan);
    log.add('rsvp', pip, { seed: seed.seq, answer: 'in' });
    log.add('unsend', null, { target: seed.seq, by: 'safety' });
    expect(log.state().seeds.map((s) => [s.unsent, s.title, s.place, s.rsvps.length])).toEqual([
      [true, null, null, 1],
    ]);
    expect(farmView(log.state(), log.at).plans).toEqual([]);
    const restored = applyRestored(log.state(), seed);
    expect(restored.seeds.map((s) => [s.unsent, s.title, s.rsvps.length])).toEqual([
      [false, 'Picnic', 1],
    ]);
    expectSnapshot(restored);
    expect(applyRestored(restored, seed)).toBe(restored);
  });
});

describe('pins and the doorstep', () => {
  it('keeps ten pins; the oldest drops off', () => {
    const log = newFarm();
    for (let target = 1; target <= 12; target++) log.add('pin', bea, { target, on: true });
    expect(log.state().pins).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    log.add('pin', bea, { target: 7, on: false });
    log.add('unsend', bea, { target: 8, by: 'author' });
    expect(log.state().pins).toEqual([3, 4, 5, 6, 9, 10, 11, 12]);
  });

  it('holds fireflies and gifts until opened, and slow posts until delivered', () => {
    const log = newFarm();
    const firefly = log.add('firefly', pip, { action: 'left', to: bea });
    log.add('gift', fig, { action: 'given', gift: 'g_1', to: bea, item: 'tea', wrap: 'kraft' });
    const post = log.add('slow_post', fig, {
      to: pip,
      text: 'later',
      when: 'morning',
      deliverAt: T0 + DAY,
    });
    log.add('gate', kit, {
      visitor: { name: 'Kit', critter },
      gesture: { gesture: 'gift', gift: 'g_2', to: fig, item: 'jam', wrap: 'kraft' },
    });
    expect(log.state().doorstep.map((d) => [d.kind, d.to])).toEqual([
      ['firefly', bea],
      ['gift', bea],
      ['slow_post', pip],
      ['gift', fig],
    ]);
    expect(log.state().doorstep[3]?.visitor?.name).toBe('Kit');
    log.add('firefly', bea, { action: 'opened', target: firefly.seq });
    log.add('gift', bea, { action: 'opened', gift: 'g_1' });
    expect(farmView(log.state(), T0 + DAY).doorstep.map((d) => d.seq)).toEqual([post.seq + 1]);
    log.wait(DAY).add('farm_opened', pip, {});
    expect(log.state().doorstep.map((d) => d.kind)).toEqual(['gift']);
    log.add('left', fig, { how: 'left' });
    expect(log.state().doorstep).toEqual([]);
  });
});

describe('roses and birthday cards', () => {
  it('waters a member’s rose with a dewdrop for them on their birthday', () => {
    const log = newFarm();
    log.add('critter_changed', bea, { birthday: '10-18' });
    log.add('dewdrop', pip, { to: bea });
    log.add('card_signed', fig, { to: bea, text: 'happy birthday' });
    log.add('dewdrop', fig, { to: pip });
    expect(log.state().roses).toEqual([
      { person: bea, day: '2026-10-18', waterers: [pip], signers: [fig] },
    ]);
    expect(farmView(log.state(), log.at).roses).toEqual([
      { person: bea, waterers: [pip], signers: [fig] },
    ]);
    expect(farmView(log.state(), log.at + DAY).roses).toEqual([]);
  });

  it('blooms nothing when the farm has birthdays off', () => {
    const log = newFarm();
    log.add('critter_changed', bea, { birthday: '10-18' });
    log.add('settings_changed', bea, { setting: 'birthdays', on: false });
    log.add('dewdrop', pip, { to: bea });
    expect(log.state().roses).toEqual([]);
    expect(farmView(log.state(), log.at).critters.some((c) => c.birthday)).toBe(false);
  });

  it('keeps a 29 February birthday on the 28th in other years', () => {
    const log = newFarm({ start: Date.UTC(2027, 1, 28, 12) });
    log.add('critter_changed', bea, { birthday: '02-29' });
    log.add('dewdrop', pip, { to: bea });
    expect(log.state().roses[0]?.day).toBe('2027-02-28');
  });
});

describe('members', () => {
  it('leaves a cottage behind; a deleted account leaves no name, plans or doorstep gifts', () => {
    const log = newFarm();
    log.add('seed_planted', pip, plan);
    log.add('firefly', pip, { action: 'left', to: bea });
    log.add('left', fig, { how: 'left' });
    log.add('left', pip, { how: 'account_deleted' });
    const state = log.state();
    expect(state.former.map((f) => [f.person, f.name, f.how])).toEqual([
      [fig, 'fig', 'left'],
      [pip, null, 'account_deleted'],
    ]);
    expect(state.seeds.map((s) => [s.unsent, s.title])).toEqual([[true, null]]);
    expect(state.doorstep).toEqual([]);
    expect(state.former.map((f) => f.joinedAt)).toEqual([T0, T0]);
    log.add('joined', fig, { name: 'Fig', critter, via: 'invite' });
    expect(log.state().former.map((f) => f.person)).toEqual([pip]);
  });

  it('counts sleepiness from the earliest join, departed members included', () => {
    const log = newFarm({ members: [bea] });
    log.wait(10 * DAY).add('left', bea, { how: 'left' });
    log.wait(6 * DAY).add('joined', pip, { name: 'Pip', critter, via: 'invite' });
    // The farm's first member joined eighteen days ago, though they have since left.
    const marigold = farmView(log.state(), log.at + 2 * DAY).plants[0];
    expect(marigold?.sleepy).toBe(true);
  });

  it('records statuses, clouds and the battery, and lets the view expire them', () => {
    const log = newFarm();
    log.add('status', bea, { status: 'words', text: 'at the allotment' });
    log.add('status', bea, { status: 'cloud', raised: true });
    log.add('status', bea, { status: 'battery', battery: 'resting' });
    const at = (now: number) => farmView(log.state(), now).critters[0];
    expect(at(log.at + HOUR)).toMatchObject({ status: 'at the allotment', cloud: true });
    expect(at(log.at + DAY + HOUR)).toMatchObject({ status: null, cloud: true });
    expect(at(log.at + 2 * DAY + HOUR)).toMatchObject({ status: null, cloud: false });
    expect(log.state().members[0]?.battery).toBe('resting');
  });

  it('lights the fire and puts it out', () => {
    const log = newFarm();
    log.add('fire', bea, { state: 'lit' });
    log.wait(HOUR).add('fire', pip, { state: 'lit' });
    expect(log.state().fireLitAt).toBe(T0);
    log.add('fire', null, { state: 'out' });
    expect(log.state().fireLitAt).toBeNull();
  });
});

describe('Snapshots, versions and the porch pot: rules versions', () => {
  it('switches rules at rules_changed and grows nothing under rules it does not know', () => {
    const log = newFarm();
    log.add('dewdrop', bea, {});
    const before = log.state();
    const newer = { ...log.add('dewdrop', pip, {}), rulesVersion: 3 };
    expect(applyEvent(before, newer)).toBe(before);
    log.add('rules_changed', null, { from: 2, to: 3 });
    log.add('dewdrop', fig, {});
    const after = log.state();
    expect(after.rulesVersion).toBe(3);
    expect(plantOf(after, 'marigold').dew).toBe(2);
    expect(farmView(after, log.at).rulesOutdated).toBe(true);
  });

  it('skips unknown and invalid events as parseEvent sorts them', () => {
    const log = newFarm();
    const state = log.state();
    const envelope = {
      seq: 9,
      opId: '0192f1e2-3b4c-7d5e-8f60-123456789abc',
      at: T0,
      rulesVersion: 1,
      actor: bea,
    };
    expect(applyParsed(state, parseEvent({ ...envelope, kind: 'moonbeam', payload: {} }))).toBe(
      state,
    );
    expect(
      applyParsed(state, parseEvent({ ...envelope, kind: 'dewdrop', payload: { to: 7 } })),
    ).toBe(state);
    const known = applyParsed(state, parseEvent({ ...envelope, kind: 'dewdrop', payload: {} }));
    expect(plantOf(known, 'marigold').dew).toBe(1);
  });

  it('never draws a plan whose planting arrived already unsent', () => {
    const log = newFarm();
    log.add('seed_planted', bea, { tombstone: 'unsent' });
    expect(log.state().seeds[0]).toMatchObject({ unsent: true, title: null, place: null });
    expect(farmView(log.state(), log.at).plans).toEqual([]);
    expectSnapshot(log.state());
  });
});
