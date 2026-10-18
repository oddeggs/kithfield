import { type EventKind, type FarmEvent, isTombstone } from './events';
import { type Tombstone, type TombstoneFacts } from './payloads/tombstone';
import { type RuleRef } from './primitives';

/**
 * What each kind's tombstone keeps, by fact name: every payload field the farm reducer reads for
 * growth, caps, roses, the doorstep, pins, plans, members and status bubbles. Kinds not listed
 * keep nothing beyond the envelope (kind, actor, time, day), which is all the reducer needs from
 * them. `gate` keeps its gesture as `action`. A `critter_changed` keeps the critter but not the
 * birthday: a birthday is personal, and neither tombstone path needs it (an account deletion
 * removes the member and their rose; a safety removal is followed by a `critter_changed` the farm
 * writes to restore the previous values).
 */
export const TOMBSTONE_KEEPS = {
  unsend: ['target'],
  pin: ['target', 'on'],
  dewdrop: ['target', 'to'],
  firefly: ['action', 'to', 'target'],
  wave: ['to'],
  knock: ['to'],
  hug: ['to'],
  slow_post: ['to'],
  card_signed: ['to'],
  gate: ['action', 'to', 'gift'],
  seed_changed: ['seed', 'hat'],
  vote: ['seed', 'option', 'on'],
  rsvp: ['seed', 'answer'],
  checkin: ['seed'],
  gift: ['action', 'gift', 'to'],
  scrapbook_page: ['action', 'seed', 'target'],
  traded: ['gave', 'got'],
  hibernate: ['on'],
  fire: ['state'],
  left: ['how'],
  removed: ['person'],
  joined: ['critter', 'via'],
  critter_changed: ['critter'],
  status: ['status', 'raised', 'battery'],
} as const satisfies Partial<Record<EventKind, readonly (keyof TombstoneFacts)[]>>;

/** The fields a kind's payload offers as facts; a gate's gesture is read from inside it. */
const factSource = (event: FarmEvent): Record<string, unknown> => {
  const payload = event.payload as unknown as Record<string, unknown>;
  if (event.kind !== 'gate' || isTombstone(event.payload)) return payload;
  const { gesture, ...rest } = event.payload.gesture;
  return { action: gesture, ...rest };
};

/**
 * The tombstone the farm writes in place of an event's payload, keeping its facts. An event that
 * is already a tombstone keeps the one it has.
 */
export const tombstoneOf = (
  event: FarmEvent,
  tombstone: Tombstone['tombstone'],
  rule?: RuleRef,
): Tombstone => {
  if (isTombstone(event.payload)) return event.payload;
  const keeps: readonly string[] =
    (TOMBSTONE_KEEPS as Partial<Record<EventKind, readonly string[]>>)[event.kind] ?? [];
  const source = factSource(event);
  const facts = Object.fromEntries(
    keeps.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  ) as TombstoneFacts;
  return {
    tombstone,
    ...(rule === undefined ? {} : { rule }),
    ...(Object.keys(facts).length > 0 ? { facts } : {}),
  };
};
