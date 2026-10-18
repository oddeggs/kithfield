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

/** What a single event grows: plants, the pot, sleepiness and the cap. */
const grownBy = (state: FarmState) => ({
  plants: state.plants,
  pot: state.pot,
  familyTendedAt: state.familyTendedAt,
  today: state.today,
  fieldGuide: state.fieldGuide,
  basket: state.basket,
  members: state.members.map((m) => [
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
          const removable = rest.filter((e) => e.actor !== null && e.kind !== 'joined');
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
            e.actor === person && e.kind !== 'joined' && e !== goodbye
              ? tombstoned(e, 'author_deleted')
              : e,
          ),
        );
        expect(growthOf(caughtUp)).toEqual(growthOf(live));
        expect(caughtUp.former.find((f) => f.person === person)?.name ?? null).toBeNull();
      }),
      { numRuns: 150 },
    );
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
    expect(live.seeds).toEqual([]);
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
    expect(reduce(before, log.events.slice(back.seq - 1)).seeds).toEqual([]);
  });
});
