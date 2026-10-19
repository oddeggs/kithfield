import {
  type EventKind,
  type FarmEvent,
  type FarmState,
  FarmEvent as FarmEventSchema,
  TOMBSTONE_KEEPS,
  tombstoneOf,
} from '@kithfield/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PEOPLE, buildLog, growthOf, history } from './arbitrary.test-data';
import { DAY, T0, bea, critter, fig, newFarm, pip } from './farm.test-data';
import { applyEvent, createFarm, reduce } from './reducer';
import { PLAN_FACTS_RULES_VERSION } from './rules';

/** What a single event grows: plants, the pot, sleepiness and the cap. */
const grownBy = (state: FarmState) => ({
  plants: state.plants,
  pot: state.pot,
  familyTendedAt: state.familyTendedAt,
  today: state.today,
  fieldGuide: state.fieldGuide,
  basket: state.basket,
  members: state.members.map((m) => [
    m.person,
    m.critter,
    m.role,
    m.cloudAt,
    m.battery,
    m.lastWokenAt,
    m.lastTendedAt,
    m.lastOpenedAt,
    m.activeThisSeason,
    m.hibernating,
  ]),
});

const tombstoned = (
  event: FarmEvent,
  how: 'unsent' | 'removed' | 'author_deleted' = 'unsent',
): FarmEvent => FarmEventSchema.parse({ ...event, payload: tombstoneOf(event, how) });

const photo = {
  key: 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abc',
  mime: 'image/jpeg',
  bytes: 9,
};
const plan = {
  title: 'Picnic',
  days: [{ date: '2026-10-18' }],
  place: null,
  yeses: 'couple',
  someday: false,
};

/** Writes that grow or change the farm, by kind, against a farm that has a plan (seq 5) and a gift. */
const writes: [EventKind, string, object][] = [
  ['message', pip, { text: 'hello' }],
  ['link', pip, { url: 'https://example.com' }],
  ['quiet_note', pip, { text: 'no reply needed' }],
  ['slow_post', pip, { to: bea, text: 'later', when: 'weekend', deliverAt: T0 + DAY }],
  ['media', pip, { items: [photo] }],
  ['sticker', pip, { pack: 'mine', sticker: 'wave' }],
  ['voice', pip, { audio: { ...photo, mime: 'audio/aac' }, durationMs: 900, waveform: [] }],
  ['dewdrop', pip, { to: bea }],
  ['firefly', pip, { action: 'left', to: bea, words: 'thinking of you' }],
  ['wave', pip, { to: bea }],
  ['knock', pip, { to: bea }],
  ['hug', pip, { to: bea, warmth: 'soup' }],
  ['gift', pip, { action: 'given', gift: 'g_2', to: bea, item: 'tea', wrap: 'kraft' }],
  ['gift', bea, { action: 'opened', gift: 'g_1' }],
  ['card_signed', pip, { to: bea, text: 'happy birthday' }],
  [
    'gate',
    'p_kit',
    { visitor: { name: 'Kit', critter }, gesture: { gesture: 'firefly', to: bea } },
  ],
  ['seed_planted', pip, plan],
  ['seed_changed', pip, { seed: 5, hat: fig, title: 'Picnic!' }],
  ['vote', pip, { seed: 5, option: 0, on: true }],
  ['rsvp', pip, { seed: 5, answer: 'in' }],
  ['checkin', pip, { seed: 5 }],
  ['scrapbook_page', pip, { action: 'pressed', title: 'Picnic', items: [], seed: 5 }],
  [
    'traded',
    pip,
    {
      with: 'p_kit',
      otherFarm: 'f_far',
      gave: null,
      got: { plant: 'plum', variant: 'frost_lace' },
    },
  ],
  ['pin', pip, { target: 5, on: true }],
  ['unsend', pip, { target: 5, by: 'author' }],
  ['hibernate', pip, { on: true }],
  ['fire', pip, { state: 'sat' }],
  ['farm_opened', pip, {}],
  ['left', pip, { how: 'account_deleted' }],
  ['removed', bea, { person: pip, removeMedia: true, by: 'keeper' }],
  ['joined', 'p_new', { name: 'New', critter: { ...critter, species: 'fox' }, via: 'invite' }],
  ['critter_changed', pip, { critter: { ...critter, species: 'owl' }, name: 'Pipkin' }],
  ['status', pip, { status: 'cloud', raised: true }],
  ['status', pip, { status: 'battery', battery: 'resting' }],
];

describe('Tombstones', () => {
  it('covers every kind whose tombstone keeps facts', () => {
    const kinds = new Set(writes.map(([kind]) => kind));
    expect(Object.keys(TOMBSTONE_KEEPS).filter((k) => !kinds.has(k as EventKind))).toEqual([]);
  });

  it.each(writes)(
    'a tombstoned %s grows the same as the original, from its kept facts',
    (kind, actor, payload) => {
      const log = newFarm();
      log.add('seed_planted', bea, plan);
      log.add('checkin', fig, { seed: 5 });
      log.add('gift', fig, { action: 'given', gift: 'g_1', to: bea, item: 'tea', wrap: 'kraft' });
      log.add('fire', bea, { state: 'lit' });
      const state = log.state();
      const event = log.add(kind, actor, payload);
      const original = applyEvent(state, event);
      const fromFacts = applyEvent(state, tombstoned(event));
      expect(grownBy(fromFacts)).toEqual(grownBy(original));
      expect(fromFacts.pins).toEqual(original.pins);
      expect(fromFacts.seeds.map((s) => [s.seq, s.hat, s.votes, s.rsvps, s.checkins])).toEqual(
        original.seeds.map((s) => [s.seq, s.hat, s.votes, s.rsvps, s.checkins]),
      );
    },
  );

  it('grows the same after any unsends or removals, for a device catching up past them', () => {
    fc.assert(
      fc.property(
        history,
        fc.array(fc.nat(), { minLength: 1, maxLength: 25 }),
        ({ kind, steps }, picks) => {
          const { events } = buildLog(kind, steps);
          const [created, ...rest] = events;
          if (created?.kind !== 'farm_created') throw new Error('no farm');
          // A removed name (from `joined`) or birthday (from `critter_changed`) can't come back on
          // replay: the farm restores a critter change with a follow-up, and names and birthdays
          // are personal, so these two are left to the account-deletion property below.
          const removable = rest.filter(
            (e) => e.actor !== null && e.kind !== 'joined' && e.kind !== 'critter_changed',
          );
          const targets = new Set(
            picks.map((p) => removable[p % Math.max(1, removable.length)]?.seq),
          );
          let seq = events.length;
          const unsends = [...targets].flatMap((target) => {
            if (target === undefined) return [];
            seq++;
            return [
              FarmEventSchema.parse({
                ...rest[0],
                seq,
                actor: null,
                kind: 'unsend',
                payload: { target, by: 'safety' },
                at: (rest.at(-1)?.at ?? T0) + 1,
              }),
            ];
          });
          const live = reduce(createFarm(created), [...rest, ...unsends]);
          const caughtUp = reduce(createFarm(created), [
            ...rest.map((e) => (targets.has(e.seq) ? tombstoned(e, 'removed') : e)),
            ...unsends,
          ]);
          expect(growthOf(caughtUp)).toEqual(growthOf(live));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('grows the same after an account deletion tombstones everything the person wrote', () => {
    fc.assert(
      fc.property(history, fc.nat(PEOPLE.length - 1), ({ kind, steps }, who) => {
        const log = buildLog(kind, steps);
        const person = PEOPLE[who] ?? bea;
        const goodbye = log.add('left', person, { how: 'account_deleted' });
        const [created, ...rest] = log.events;
        if (created?.kind !== 'farm_created') throw new Error('no farm');
        const live = reduce(createFarm(created), rest);
        const caughtUp = reduce(
          createFarm(created),
          rest.map((e) =>
            e.actor === person && e !== goodbye ? tombstoned(e, 'author_deleted') : e,
          ),
        );
        expect(growthOf(caughtUp)).toEqual(growthOf(live));
        expect(caughtUp.former.find((f) => f.person === person)?.name ?? null).toBeNull();
      }),
      { numRuns: 150 },
    );
  });

  it('grows the same after a planter deletes their account, for a plan that sprouted first', () => {
    // A plan on a visit sprouts once one of two people leaves; a check-in follows; then its
    // planter deletes their account. The tombstoned planting must still sprout on replay.
    const steps = [
      { gap: 0, who: 2, to: 0, act: { t: 'seed', place: true, yeses: 'most' } },
      { gap: 0, who: 0, to: 0, act: { t: 'rsvp', seed: 0, answer: 'in' } },
      { gap: 0, who: 4, to: 0, act: { t: 'leave', deleted: false } },
      { gap: 0, who: 0, to: 0, act: { t: 'vote', seed: 0, option: 0, on: false } },
      { gap: 0, who: 0, to: 0, act: { t: 'openGift', n: 0 } },
      { gap: 0, who: 0, to: 0, act: { t: 'checkin', seed: 0 } },
      { gap: 0, who: 0, to: 0, act: { t: 'simple', i: 0 } },
      { gap: 0, who: 0, to: 0, act: { t: 'vote', seed: 0, option: 0, on: false } },
      { gap: 0, who: 0, to: 0, act: { t: 'rain' } },
      { gap: 0, who: 0, to: 0, act: { t: 'simple', i: 0 } },
    ] as unknown as Parameters<typeof buildLog>[1];
    const log = buildLog('visit', steps);
    const person = PEOPLE[2] ?? bea;
    const goodbye = log.add('left', person, { how: 'account_deleted' });
    const [created, ...rest] = log.events;
    if (created?.kind !== 'farm_created') throw new Error('no farm');
    const live = reduce(createFarm(created), rest);
    const caughtUp = reduce(
      createFarm(created),
      rest.map((e) => (e.actor === person && e !== goodbye ? tombstoned(e, 'author_deleted') : e)),
    );
    expect(growthOf(caughtUp)).toEqual(growthOf(live));
  });

  it('grows a plan the same after its editor deletes their account', () => {
    // Pip plants a plan with two days and nowhere yet; Bea settles it on the first, adds a place
    // and asks for most yeses. It sprouts and gets a check-in; then Bea deletes her account.
    const log = newFarm();
    const seed = log.add('seed_planted', pip, {
      ...plan,
      days: [{ date: '2026-10-18' }, { date: '2026-10-19' }],
    });
    log.add('seed_changed', bea, {
      seed: seed.seq,
      days: [{ date: '2026-10-18', time: '18:00' }],
      place: { name: 'The park' },
      yeses: 'most',
      settleOn: '2026-10-18',
    });
    log.add('rsvp', pip, { seed: seed.seq, answer: 'in' });
    log.add('rsvp', fig, { seed: seed.seq, answer: 'in' });
    log.add('checkin', pip, { seed: seed.seq });
    log.add('checkin', fig, { seed: seed.seq });
    const goodbye = log.add('left', bea, { how: 'account_deleted' });
    const [created, ...rest] = log.events;
    if (created?.kind !== 'farm_created') throw new Error('no farm');
    const live = reduce(createFarm(created), rest);
    const caughtUp = reduce(
      createFarm(created),
      rest.map((e) => (e.actor === bea && e !== goodbye ? tombstoned(e, 'author_deleted') : e)),
    );
    const sprouting = (state: FarmState) => ({
      ...growthOf(state),
      seeds: state.seeds.map((s) => ({
        days: s.days.map((d) => d.date),
        place: s.place !== null || s.placed === true,
        yeses: s.yeses,
        someday: s.someday,
        settleOn: s.settleOn,
        checkins: s.checkins,
        sproutedAt: s.sproutedAt,
      })),
    });
    expect(live.seeds[0]?.sproutedAt).not.toBeNull();
    expect(sprouting(caughtUp)).toEqual(sprouting(live));
    // The editor's words and place are not kept: only that there was one.
    expect(caughtUp.seeds[0]).toMatchObject({ title: 'Picnic', place: null, placed: true });
  });

  it('lets a tombstoned planting sprout from its facts, and reads older rules as before', () => {
    const log = newFarm();
    const seed = log.add('seed_planted', bea, { ...plan, place: { name: 'Park' } });
    log.add('rsvp', pip, { seed: seed.seq, answer: 'in' });
    log.add('rsvp', fig, { seed: seed.seq, answer: 'in' });
    const [created, ...rest] = log.events;
    if (created?.kind !== 'farm_created') throw new Error('no farm');
    const gone = rest.map((e) => (e.seq === seed.seq ? tombstoned(e, 'removed') : e));
    const rebuilt = reduce(createFarm(created), gone).seeds[0];
    expect(rebuilt).toMatchObject({ unsent: true, title: null, place: null, placed: true });
    expect(rebuilt?.sproutedAt).not.toBeNull();
    // Under the rules before, the same log never sprouts the plan.
    const older = gone.map((e) => ({ ...e, rulesVersion: PLAN_FACTS_RULES_VERSION - 1 }));
    const before = reduce(
      createFarm({ ...created, rulesVersion: PLAN_FACTS_RULES_VERSION - 1 }),
      older,
    );
    expect(before.seeds[0]?.sproutedAt).toBeNull();
  });

  it('grows the same live and on replay across a removal and its restore', () => {
    const log = newFarm();
    const seed = log.add('seed_planted', bea, plan);
    log.add('rsvp', pip, { seed: seed.seq, answer: 'in' });
    // Live: the farm object applies each event as it writes it, finding targets in its log.
    const [created, ...rest] = log.events;
    if (created?.kind !== 'farm_created') throw new Error('no farm');
    let live = reduce(createFarm(created), rest);
    const removal = log.add('unsend', null, { target: seed.seq, by: 'safety' });
    live = applyEvent(live, removal);
    expect(live.seeds.map((s) => s.unsent)).toEqual([true]);
    // The appeal puts the payload back in the log, then writes `restored`.
    const back = log.add('restored', null, { target: seed.seq });
    const byLog = { event: (seq: number) => log.events.find((e) => e.seq === seq) };
    live = applyEvent(live, back, byLog);
    log.add('vote', fig, { seed: seed.seq, option: 0, on: true });
    live = applyEvent(live, log.events[log.events.length - 1] ?? back, byLog);
    expect(live.seeds.map((s) => [s.title, s.votes])).toEqual([
      ['Picnic', [{ option: 0, people: [fig] }]],
    ]);
    expect(log.state()).toEqual(live);
    // A phone that took a snapshot before the restore pages the target in through its lookup.
    const before = reduce(createFarm(created), log.events.slice(1, back.seq - 1));
    expect(reduce(before, log.events.slice(back.seq - 1), byLog)).toEqual(live);
    expect(reduce(before, log.events.slice(back.seq - 1)).seeds.map((s) => s.unsent)).toEqual([
      true,
    ]);
  });
});
