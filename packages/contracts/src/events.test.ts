import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  EVENT_KINDS,
  EventEnvelope,
  FarmEvent,
  isTombstone,
  parseEvent,
  type EventKind,
} from './events';
import { LIMITS } from './primitives';
import { at, badEventPayloads, bea, eventPayloads, fig, opId } from './samples.test-data';

/** Kinds the farm writes by itself, with a null actor. */
const FARM_ONLY = new Set<string>([
  'farm_created',
  'weather',
  'shared_rain',
  'season_rolled',
  'harvested',
  'rules_changed',
  'restored',
]);

const eventOf = (kind: string, payload: unknown, seq = 40) => ({
  seq,
  opId,
  at,
  actor: FARM_ONLY.has(kind) ? null : bea,
  rulesVersion: 1,
  kind,
  payload,
});

const roundTrip = (value: unknown) => {
  const parsed = FarmEvent.parse(value);
  expect(parsed).toEqual(value);
  expect(FarmEvent.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
};

const valid = (value: unknown) => FarmEvent.safeParse(value).success;

describe('farm events', () => {
  it.each(EVENT_KINDS)('%s: a valid event parses and survives JSON unchanged', (kind) => {
    roundTrip(eventOf(kind, eventPayloads[kind]));
  });

  it.each(EVENT_KINDS)('%s: invalid payloads fail', (kind) => {
    for (const payload of badEventPayloads[kind]) {
      expect(valid(eventOf(kind, payload)), JSON.stringify(payload)).toBe(false);
    }
  });

  it('accepts a tombstone in place of any content a person wrote', () => {
    for (const kind of EVENT_KINDS.filter((k) => !FARM_ONLY.has(k))) {
      const event = eventOf(kind, { tombstone: 'removed', rule: 3 });
      roundTrip(event);
      expect(isTombstone(FarmEvent.parse(event).payload)).toBe(true);
    }
  });

  it('never tombstones what the farm writes by itself', () => {
    for (const kind of FARM_ONLY) {
      expect(valid(eventOf(kind, { tombstone: 'unsent' })), kind).toBe(false);
    }
  });

  it('allows a null actor only where the farm or the safety team writes', () => {
    const withActor = (kind: EventKind, payload: object, actor: string | null) => ({
      ...eventOf(kind, payload),
      actor,
    });
    const cases: [EventKind, object, string | null, boolean][] = [
      ['message', eventPayloads.message, null, false],
      ['joined', eventPayloads.joined, null, false],
      ['traded', eventPayloads.traded, null, false],
      ['gate', eventPayloads.gate, null, false],
      ['weather', eventPayloads.weather, bea, false],
      ['farm_created', eventPayloads.farm_created, bea, false],
      ['unsend', { target: 14, by: 'safety' }, null, true],
      ['unsend', { target: 14, by: 'safety' }, bea, false],
      ['unsend', { target: 14, by: 'author' }, null, false],
      ['removed', { person: fig, removeMedia: true, by: 'safety' }, null, true],
      ['removed', { person: fig, removeMedia: true, by: 'keeper' }, null, false],
      ['settings_changed', { setting: 'frozen', on: true }, null, true],
      ['settings_changed', { setting: 'frozen', on: true }, bea, false],
      ['settings_changed', { setting: 'paused', person: fig, until: at }, null, true],
      ['settings_changed', { setting: 'paused', person: fig, until: null }, null, true],
      ['settings_changed', { setting: 'name', name: 'Lot' }, null, false],
      ['fire', { state: 'out' }, null, true],
      ['fire', { state: 'out' }, bea, false],
      ['fire', { state: 'lit' }, null, false],
    ];
    for (const [kind, payload, actor, ok] of cases) {
      const event = withActor(kind, payload, actor);
      expect(valid(event), `${kind} ${JSON.stringify(payload)} by ${actor}`).toBe(ok);
      if (ok) roundTrip(event);
    }
  });

  it('rejects broken envelopes', () => {
    const good = eventOf('message', eventPayloads.message);
    const broken = [
      { ...good, seq: 0 },
      { ...good, seq: 1.5 },
      { ...good, opId: opId.toUpperCase() },
      { ...good, opId: '0192f1e2-3b4c-4d5e-8f60-123456789abc' },
      { ...good, at: -1 },
      { ...good, at: '2026-10-18T09:41:00Z' },
      { ...good, rulesVersion: 0 },
      { ...good, kind: 'streak' },
    ];
    for (const event of broken) expect(valid(event)).toBe(false);
  });

  it('keeps any message text within the limit, unchanged through JSON', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: LIMITS.message }).filter((s) => /\S/.test(s)),
        fc.integer({ min: 1, max: 2 ** 40 }),
        fc.uuid({ version: 7 }),
        (text, seq, id) => {
          roundTrip({ ...eventOf('message', { text }, seq), opId: id.toLowerCase() });
        },
      ),
    );
  });

  it('applies the people limits on shared rain and together stickers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), (n) => {
        const people = Array.from({ length: n }, (_, i) => `p_${i}`);
        expect(valid(eventOf('shared_rain', { day: '2026-10-18', people }))).toBe(
          n >= 3 && n <= LIMITS.members,
        );
        const sticker = { pack: 'mine', sticker: 'hug', with: people };
        expect(valid(eventOf('sticker', sticker))).toBe(n >= 1 && n <= 4);
      }),
    );
  });
});

describe('events this app may not know', () => {
  it('round-trips any envelope, payload untouched', () => {
    const later = eventOf('lantern_lit', { colour: 'amber', nested: { a: [1, 2] } }, 99);
    const parsed = EventEnvelope.parse(later);
    expect(parsed).toEqual(later);
    expect(EventEnvelope.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(EventEnvelope.safeParse({ ...later, kind: 'Bad Kind' }).success).toBe(false);
    expect(EventEnvelope.safeParse({ ...later, seq: 0 }).success).toBe(false);
  });

  it('sorts events into known and unknown', () => {
    const known = parseEvent(eventOf('message', eventPayloads.message));
    expect(known.known).toBe(true);
    if (known.known) expect(known.event.kind).toBe('message');

    const newKind = parseEvent(eventOf('lantern_lit', {}));
    expect(newKind).toEqual({ known: false, event: eventOf('lantern_lit', {}) });

    const newValue = parseEvent(eventOf('reaction', { target: 3, reaction: 'clover' }));
    expect(newValue.known).toBe(false);
    expect(newValue.event.seq).toBe(40);
  });

  it('throws on something that is not an event at all', () => {
    expect(() => parseEvent({ kind: 'message' })).toThrow();
    expect(() => parseEvent(null)).toThrow();
  });
});
