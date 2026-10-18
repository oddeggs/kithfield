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
import { applyRestored, planDay } from './plans';
import { applyEvent, applyParsed, replay } from './reducer';
import { PLAN_DAY_RULES_VERSION, RULES_VERSION } from './rules';
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

  /** A plan with a place and two yeses: all it needs is its day. */
  const readyPlan = (log: ReturnType<typeof newFarm>, days: readonly string[]) => {
    const seed = log.add('seed_planted', bea, {
      ...plan,
      days: days.map((date) => ({ date })),
      place: { name: 'Willow bend' },
    });
    log.add('rsvp', bea, { seed: seed.seq, answer: 'in' });
    log.add('rsvp', pip, { seed: seed.seq, answer: 'in' });
    return seed;
  };

  it('sprouts on its settling day, not before, even if nobody touches it that day', () => {
    const log = newFarm();
    const seed = readyPlan(log, ['2026-10-21', '2026-10-22']);
    log.add('vote', fig, { seed: seed.seq, option: 1, on: true });
    log.add('seed_changed', bea, { seed: seed.seq, settleOn: '2026-10-19' });
    expect(log.state().seeds[0]?.sproutedAt).toBeNull();
    expect(farmView(log.state(), log.at).plans[0]?.conditions.day).toBe(false);
    // The next day, the first event the farm sees is someone else's.
    log.wait(DAY).add('dewdrop', fig, {});
    const sprouted = log.state().seeds[0];
    expect(sprouted?.sproutedAt).toBe(log.at);
    expect(sprouted && planDay(sprouted)).toBe('2026-10-22');
  });

  it('sprouts at once when its settling day is today', () => {
    const log = newFarm();
    const seed = readyPlan(log, ['2026-10-21', '2026-10-22']);
    log.add('seed_changed', bea, { seed: seed.seq, settleOn: '2026-10-18' });
    const sprouted = log.state().seeds[0];
    expect(sprouted?.sproutedAt).toBe(log.at);
    // Nobody leaned on a day: the first one.
    expect(sprouted && planDay(sprouted)).toBe('2026-10-21');
  });

  it('keeps a sprouted plan on its day: later votes, days and settling days change nothing', () => {
    const log = newFarm();
    const seed = readyPlan(log, ['2026-10-21', '2026-10-22']);
    log.add('vote', fig, { seed: seed.seq, option: 1, on: true });
    log.add('seed_changed', bea, { seed: seed.seq, settleOn: '2026-10-18' });
    const sprouted = log.state().seeds[0];
    log.add('vote', bea, { seed: seed.seq, option: 0, on: true });
    log.add('vote', pip, { seed: seed.seq, option: 0, on: true });
    log.add('seed_changed', bea, {
      seed: seed.seq,
      days: [{ date: '2026-10-30' }],
      settleOn: null,
      title: 'Picnic by the river',
    });
    const after = log.state().seeds[0];
    expect(after).toMatchObject({
      title: 'Picnic by the river',
      days: sprouted?.days,
      settleOn: '2026-10-18',
      votes: sprouted?.votes,
    });
    expect(after && planDay(after)).toBe('2026-10-22');
  });

  it("counts a check-in only on a sprouted plan's own day", () => {
    const log = newFarm();
    const seed = readyPlan(log, ['2026-10-19']);
    expect(log.state().seeds[0]?.sproutedAt).not.toBeNull();
    log.add('checkin', pip, { seed: seed.seq });
    expect(log.state().seeds[0]?.checkins).toEqual([]);
    log.wait(DAY).add('checkin', pip, { seed: seed.seq });
    log.add('checkin', fig, { seed: seed.seq });
    expect(log.state().seeds[0]?.checkins).toEqual([pip, fig]);
    log.wait(DAY).add('checkin', bea, { seed: seed.seq });
    expect(log.state().seeds[0]?.checkins).toEqual([pip, fig]);
  });

  it('counts nothing for a plan that has not sprouted, even on one of its days', () => {
    const log = newFarm();
    const seed = log.add('seed_planted', bea, { ...plan, days: [{ date: '2026-10-18' }] });
    log.add('checkin', pip, { seed: seed.seq });
    log.add('checkin', fig, { seed: seed.seq });
    expect(log.state().seeds[0]?.checkins).toEqual([]);
  });

  it('reads plans written under earlier rules as those rules had them', () => {
    const log = newFarm();
    const seed = log.add('seed_planted', bea, {
      ...plan,
      days: [{ date: '2026-10-21' }, { date: '2026-10-22' }],
      place: { name: 'Willow bend' },
    });
    log.add('rsvp', bea, { seed: seed.seq, answer: 'in' });
    log.add('rsvp', pip, { seed: seed.seq, answer: 'in' });
    log.add('seed_changed', bea, { seed: seed.seq, settleOn: '2026-10-25' });
    log.add('checkin', fig, { seed: seed.seq });
    const earlier = replay(
      log.events.map((e) => ({ ...e, rulesVersion: PLAN_DAY_RULES_VERSION - 1 })),
    );
    expect(earlier?.seeds[0]).toMatchObject({ sproutedAt: log.at, checkins: [fig] });
    expect(log.state().seeds[0]).toMatchObject({ sproutedAt: null, checkins: [] });
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
    const newer = { ...log.add('dewdrop', pip, {}), rulesVersion: RULES_VERSION + 1 };
    expect(applyEvent(before, newer)).toBe(before);
    log.add('rules_changed', null, { from: RULES_VERSION, to: RULES_VERSION + 1 });
    log.add('dewdrop', fig, {});
    const after = log.state();
    expect(after.rulesVersion).toBe(RULES_VERSION + 1);
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
