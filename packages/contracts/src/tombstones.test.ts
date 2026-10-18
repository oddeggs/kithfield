import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EVENT_KINDS, FarmEvent, type EventKind } from './events';
import { Tombstone, TombstoneFacts } from './payloads/tombstone';
import { at, bea, eventPayloads, opId } from './samples.test-data';
import { TOMBSTONE_KEEPS, tombstoneOf } from './tombstones';

/** Kinds that can never be tombstoned: the farm's own, and farm settings. */
const NEVER = new Set<string>([
  'farm_created',
  'weather',
  'shared_rain',
  'season_rolled',
  'harvested',
  'rules_changed',
  'restored',
  'settings_changed',
]);

/** Fields named like a fact that the reducer ignores for these kinds, and why. */
const IGNORED: Partial<Record<EventKind, readonly string[]>> = {
  /** An edit changes words only. */
  edit: ['target'],
  /** Reactions grow nothing. */
  reaction: ['target'],
};

const keeps = TOMBSTONE_KEEPS as Partial<Record<EventKind, readonly string[]>>;
const factNames = new Set(Object.keys(TombstoneFacts.shape));

const optionsOf = (schema: z.ZodType): z.ZodType[] => {
  if (schema instanceof z.ZodDiscriminatedUnion || schema instanceof z.ZodUnion) {
    return (schema.options as z.ZodType[]).flatMap(optionsOf);
  }
  return [schema];
};

/** Every field name a kind's payload can carry, from the event schema itself. */
const payloadFields = (kind: EventKind): string[] => {
  const option = FarmEvent.options.find((o) => o.shape.kind.value === kind);
  if (!option) throw new Error(kind);
  const fields = new Set<string>();
  for (const branch of optionsOf(option.shape.payload as z.ZodType)) {
    if (branch === Tombstone || !(branch instanceof z.ZodObject)) continue;
    for (const [name, field] of Object.entries(branch.shape)) {
      fields.add(name);
      // A gate's gesture is kept flat, its `gesture` as `action`.
      if (kind === 'gate' && name === 'gesture') {
        for (const g of optionsOf(field as z.ZodType)) {
          if (g instanceof z.ZodObject) {
            Object.keys(g.shape).forEach((n) => fields.add(n === 'gesture' ? 'action' : n));
          }
        }
      }
    }
  }
  return [...fields];
};

const eventOf = (kind: EventKind) => ({
  seq: 40,
  opId,
  at,
  actor: bea,
  rulesVersion: 1,
  kind,
  payload: eventPayloads[kind],
});

describe('tombstones keep what the reducer reads', () => {
  const tombstonable = EVENT_KINDS.filter((k) => !NEVER.has(k));

  it.each(tombstonable)('%s keeps every fact-named payload field', (kind) => {
    const kept = new Set(keeps[kind] ?? []);
    const ignored = new Set(IGNORED[kind] ?? []);
    const needed = payloadFields(kind).filter((f) => factNames.has(f) && !ignored.has(f));
    expect(needed.filter((f) => !kept.has(f))).toEqual([]);
    for (const f of kept) expect(payloadFields(kind), f).toContain(f);
  });

  it('lists only kinds that can hold a tombstone, with known fact names', () => {
    for (const [kind, names] of Object.entries(keeps)) {
      expect(NEVER.has(kind), kind).toBe(false);
      for (const name of names ?? []) expect(factNames.has(name), name).toBe(true);
    }
  });

  it.each(tombstonable)(
    '%s: the farm tombstone parses, keeps its facts and round-trips',
    (kind) => {
      const event = FarmEvent.parse(eventOf(kind));
      const tombstone = tombstoneOf(event, 'author_deleted');
      const stored = FarmEvent.parse({ ...event, payload: tombstone });
      expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
      expect(Object.keys(tombstone.facts ?? {}).sort()).toEqual(
        (keeps[kind] ?? []).filter((k) => tombstone.facts && k in tombstone.facts).sort(),
      );
      expect(JSON.stringify(tombstone)).not.toMatch(/text|caption|words|name|critter/);
    },
  );

  it('keeps the facts that matter for a few kinds exactly', () => {
    const facts = (kind: EventKind) => tombstoneOf(FarmEvent.parse(eventOf(kind)), 'unsent').facts;
    expect(facts('vote')).toEqual({ seed: 20, option: 1, on: true });
    expect(facts('gift')).toEqual({ action: 'given', gift: 'g_1', to: bea });
    expect(facts('gate')).toEqual({ action: 'gift', to: bea, gift: 'g_2' });
    expect(facts('traded')).toEqual({
      gave: { plant: 'lavender', variant: 'rain_kissed' },
      got: { plant: 'plum', variant: null },
    });
    expect(facts('message')).toBeUndefined();
    const removal = tombstoneOf(FarmEvent.parse(eventOf('dewdrop')), 'removed', 3);
    expect(removal).toEqual({ tombstone: 'removed', rule: 3, facts: { target: 14 } });
  });

  it('rejects facts of the wrong shape', () => {
    for (const facts of [{ option: 14 }, { answer: 'perhaps' }, { action: 'x'.repeat(17) }]) {
      expect(Tombstone.safeParse({ tombstone: 'unsent', facts }).success).toBe(false);
    }
  });
});
