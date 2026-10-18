import type { FarmEvent, FarmState, PersonId } from '@kithfield/contracts';

/*
 * People merged into another person (an anonymous install signing in to a returning account).
 * Past events keep their old actor; the snapshot's `aliases` maps each merged-away id to the kept
 * one, and everything that reads people goes through it.
 */

/** Payload keys that hold a person id or a list of them, in a payload or a tombstone's facts. */
const PERSON_KEYS = ['to', 'person', 'with', 'hat', 'people', 'mentions'] as const;

type Aliases = Pick<FarmState, 'aliases'>;

/** Who a person id is now: the kept person for a merged-away id, else itself. */
export const aliasOf = (state: Aliases, person: PersonId): PersonId =>
  state.aliases[person] ?? person;

/** A person id, or a list of them, read through the aliases; the same value when none applies. */
const moveValue = (state: Aliases, value: unknown): unknown => {
  if (typeof value === 'string') return aliasOf(state, value);
  if (!Array.isArray(value) || !value.some((v) => typeof v === 'string' && v in state.aliases)) {
    return value;
  }
  return value.map((v: unknown) => (typeof v === 'string' ? aliasOf(state, v) : v));
};

/** A payload (or its tombstone's facts) with the people it names moved; the same object if none. */
const moveFields = (state: Aliases, fields: Record<string, unknown>): Record<string, unknown> => {
  let moved: Record<string, unknown> | null = null;
  for (const key of PERSON_KEYS) {
    if (!(key in fields)) continue;
    const next = moveValue(state, fields[key]);
    if (next === fields[key]) continue;
    moved ??= { ...fields };
    moved[key] = next;
  }
  const facts = fields['facts'];
  if (typeof facts === 'object' && facts !== null && !Array.isArray(facts)) {
    const nextFacts = moveFields(state, facts as Record<string, unknown>);
    if (nextFacts !== facts) {
      moved ??= { ...fields };
      moved['facts'] = nextFacts;
    }
  }
  return moved ?? fields;
};

/**
 * The event as the kept people wrote it: its actor and the people its payload names, read through
 * the farm's aliases. The same event object comes back when nothing in it was merged away.
 */
export const withAliases = (state: Aliases, event: FarmEvent): FarmEvent => {
  if (Object.keys(state.aliases).length === 0) return event;
  const actor = event.actor === null ? null : aliasOf(state, event.actor);
  const payload = moveFields(state, event.payload as Record<string, unknown>);
  if (actor === event.actor && payload === event.payload) return event;
  return { ...event, actor, payload } as FarmEvent;
};
