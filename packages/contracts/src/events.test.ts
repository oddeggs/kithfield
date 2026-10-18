import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EVENT_KINDS, FARM_WRITTEN_KINDS, FarmEvent, isTombstone, type EventKind } from './events';
import { LIMITS } from './primitives';
import { at, badEventPayloads, bea, eventPayloads, opId } from './samples.test-data';

const farmOnly = new Set<string>(FARM_WRITTEN_KINDS);
const PERSON_WRITTEN_BY_FARM = new Set<string>(['farm_opened', 'joined']);

const eventOf = (kind: EventKind, payload: object, seq = 40) => ({
  seq,
  opId,
  at,
  actor: farmOnly.has(kind) && !PERSON_WRITTEN_BY_FARM.has(kind) ? null : bea,
  rulesVersion: 1,
  kind,
  payload,
});

const roundTrip = (value: unknown) => {
  const parsed = FarmEvent.parse(value);
  expect(parsed).toEqual(value);
  expect(FarmEvent.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
};

describe('farm events', () => {
  it.each(EVENT_KINDS)('%s: a valid event parses and survives JSON unchanged', (kind) => {
    roundTrip(eventOf(kind, eventPayloads[kind]));
  });

  it.each(EVENT_KINDS)('%s: invalid payloads fail', (kind) => {
    for (const payload of badEventPayloads[kind]) {
      expect(FarmEvent.safeParse(eventOf(kind, payload)).success, JSON.stringify(payload)).toBe(
        false,
      );
    }
  });

  it('accepts a tombstone in place of any content a person wrote', () => {
    for (const kind of EVENT_KINDS) {
      if (farmOnly.has(kind) && !PERSON_WRITTEN_BY_FARM.has(kind)) continue;
      const event = eventOf(kind, { tombstone: 'removed', rule: 3 });
      roundTrip(event);
      const parsed = FarmEvent.parse(event);
      expect(isTombstone(parsed.payload)).toBe(true);
    }
  });

  it('never tombstones what the farm writes by itself', () => {
    for (const kind of ['weather', 'shared_rain', 'season_rolled', 'rules_changed'] as const) {
      expect(FarmEvent.safeParse(eventOf(kind, { tombstone: 'unsent' })).success).toBe(false);
    }
  });

  it('requires a null actor on events the farm writes by itself', () => {
    const weather = { ...eventOf('weather', eventPayloads.weather), actor: bea };
    expect(FarmEvent.safeParse(weather).success).toBe(false);
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
    for (const event of broken) expect(FarmEvent.safeParse(event).success).toBe(false);
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

  it('applies the per-person limits on statuses, together stickers and shared rain', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), (n) => {
        const people = Array.from({ length: n }, (_, i) => `p_${i}`);
        const rain = eventOf('shared_rain', { day: '2026-10-18', people });
        expect(FarmEvent.safeParse(rain).success).toBe(n >= 3 && n <= LIMITS.members);
        const sticker = eventOf('sticker', { pack: 'mine', sticker: 'hug', with: people });
        expect(FarmEvent.safeParse(sticker).success).toBe(n >= 1 && n <= 4);
      }),
    );
  });
});
