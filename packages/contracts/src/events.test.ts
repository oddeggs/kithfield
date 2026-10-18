import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DAY_FROM_RULES_VERSION,
  EVENT_KINDS,
  FARM_WRITTEN_KINDS,
  ON_BEHALF_KINDS,
  EventEnvelope,
  FarmEvent,
  isTombstone,
  parseEvent,
  type EventKind,
} from './events';
import { COMMAND_KINDS } from './commands';
import { KNOWN_WARMTHS } from './payloads/care';
import { KNOWN_WEATHER_SOURCES } from './payloads/farm';
import { KNOWN_REACTIONS, LIMITS } from './primitives';
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
  day: '2026-10-18',
  rulesVersion: 2,
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

  it('keeps display-only enums open and lists the known values', () => {
    roundTrip(eventOf('reaction', { target: 14, reaction: 'clover' }));
    roundTrip(eventOf('hug', { to: fig, warmth: 'blanket' }));
    roundTrip(eventOf('weather', { day: '2026-10-18', weather: 'rain', source: 'met_office' }));
    expect(KNOWN_REACTIONS).toHaveLength(11);
    expect(KNOWN_REACTIONS).not.toContain('dewdrop');
    expect(KNOWN_WARMTHS).toEqual(['here', 'thinking', 'soup', 'glow']);
    expect(KNOWN_WEATHER_SOURCES).toEqual(['weatherkit']);
    expect(valid(eventOf('weather', { day: '2026-10-18', weather: 'snow', source: 'x' }))).toBe(
      false,
    );
  });

  it('never tombstones farm settings', () => {
    const settings = eventOf('settings_changed', { tombstone: 'author_deleted' });
    expect(valid(settings)).toBe(false);
  });

  it('accepts a tombstone in place of any content a person wrote', () => {
    const content = EVENT_KINDS.filter((k) => !FARM_ONLY.has(k) && k !== 'settings_changed');
    for (const kind of content) {
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
      ['settings_changed', { setting: 'role', person: fig, role: 'keeper' }, null, true],
      ['settings_changed', { setting: 'role', person: fig, role: 'keeper' }, bea, true],
      ['settings_changed', { setting: 'role', person: fig, role: 'helper' }, null, false],
      ['settings_changed', { setting: 'theme', theme: 'snowy_hollow' }, null, true],
      ['settings_changed', { setting: 'theme', theme: 'snowy_hollow' }, bea, true],
      ['settings_changed', { setting: 'theme', theme: null }, bea, true],
      ['critter_changed', { name: 'June' }, null, false],
      ['gift', { ...eventPayloads.gift, chipIn: 'ci_1', with: [fig] }, null, false],
    ];
    for (const [kind, payload, actor, ok] of cases) {
      const event = withActor(kind, payload, actor);
      expect(valid(event), `${kind} ${JSON.stringify(payload)} by ${actor}`).toBe(ok);
      if (ok) roundTrip(event);
    }
  });

  it('carries the farm-time day from the rules version that brought it', () => {
    const message = eventOf('message', eventPayloads.message);
    const { day: _day, ...noDay } = message;
    expect(DAY_FROM_RULES_VERSION).toBe(2);
    expect(valid(noDay)).toBe(false);
    expect(EventEnvelope.safeParse(noDay).success).toBe(false);
    roundTrip({ ...noDay, rulesVersion: 1 });
    expect(EventEnvelope.safeParse({ ...noDay, rulesVersion: 1 }).success).toBe(true);
    for (const day of ['18/10/2026', '2026-13-01', 20261018]) {
      expect(valid({ ...message, day }), String(day)).toBe(false);
    }
  });

  it("names the kinds the farm may write on a person's behalf", () => {
    for (const kind of ON_BEHALF_KINDS) expect(EVENT_KINDS).toContain(kind);
    for (const kind of ['critter_changed', 'status', 'seed_changed', 'gift'] as const) {
      expect(ON_BEHALF_KINDS).toContain(kind);
      expect(FARM_WRITTEN_KINDS).not.toContain(kind);
      expect(COMMAND_KINDS).toContain(kind);
    }
  });

  it('carries a chip-in gift with everyone who chipped in, and never an amount', () => {
    const given = { ...eventPayloads.gift, note: 'for the lantern x', chipIn: 'ci_1', with: [fig] };
    roundTrip({ ...eventOf('gift', given), actor: bea });
    const parsed = FarmEvent.parse(eventOf('gift', { ...given, amount: 300 }));
    expect(parsed.payload).not.toHaveProperty('amount');
  });

  it('lets the farm restore a removed plan edit with the editor as actor', () => {
    const restore = { seed: 20, title: 'Picnic by the river', days: [], place: null };
    roundTrip({ ...eventOf('seed_changed', restore), actor: fig });
    expect(valid({ ...eventOf('seed_changed', restore), actor: null })).toBe(false);
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

  it('sorts events into known, unknown and invalid', () => {
    const known = parseEvent(eventOf('message', eventPayloads.message));
    expect(known.status).toBe('known');
    if (known.status === 'known') expect(known.event.kind).toBe('message');

    const newKind = parseEvent(eventOf('lantern_lit', { colour: 'amber' }));
    expect(newKind).toEqual({
      status: 'unknown',
      event: eventOf('lantern_lit', { colour: 'amber' }),
    });

    const newReaction = parseEvent(eventOf('reaction', { target: 3, reaction: 'clover' }));
    expect(newReaction.status).toBe('known');

    const raw = eventOf('rsvp', { seed: 20, answer: 'perhaps' });
    expect(parseEvent(raw)).toEqual({
      status: 'invalid',
      raw,
      kind: 'rsvp',
      seq: 40,
      issues: expect.arrayContaining([['payload', 'answer']]) as unknown,
    });
  });

  it('calls a broken envelope invalid, with paths and no content', () => {
    const noSeq = { ...eventOf('message', eventPayloads.message), seq: 0 };
    const parsed = parseEvent(noSeq);
    expect(parsed.status).toBe('invalid');
    if (parsed.status !== 'invalid') return;
    expect(parsed).toMatchObject({ kind: 'message', seq: 0, issues: [['seq']] });
    expect(JSON.stringify(parsed.issues)).not.toContain('saturday');
    expect(parseEvent(null)).toMatchObject({ status: 'invalid', kind: null, seq: null });
    expect(parseEvent({ ...eventOf('lantern_lit', {}), kind: 'Bad Kind' }).status).toBe('invalid');
  });
});
