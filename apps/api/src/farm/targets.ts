import {
  type EventEnvelope,
  type FarmCommand,
  isTombstone,
  type PersonId,
  type RejectReason,
} from '@kithfield/contracts';

/*
 * Checks a write against the log it points into: the target exists, is the right kind, is still
 * there, and (for edits and unsends) is the writer's own. The farm rules check everything else.
 */

/** Edits are allowed for 15 minutes after sending. */
export const EDIT_WINDOW_MS = 15 * 60_000;

/** What reactions, pins, dewdrops and replies can point at. */
const CHAT_KINDS = new Set(['message', 'sticker', 'media', 'voice', 'link', 'quiet_note']);

/** Kinds that are records of membership, presence or settings rather than something someone said. */
const NOT_UNSENDABLE = new Set([
  'unsend',
  'edit',
  'joined',
  'left',
  'removed',
  'critter_changed',
  'settings_changed',
  'farm_opened',
  'hibernate',
  'fire',
  'gate',
  'traded',
]);

type Lookup = (seq: number) => EventEnvelope | null;

const field = (event: EventEnvelope, key: string): unknown =>
  typeof event.payload === 'object' && event.payload !== null
    ? (event.payload as Record<string, unknown>)[key]
    : undefined;

/** The target must exist, be one of `kinds` and still be there. */
const pointsAt = (lookup: Lookup, seq: number, kinds: ReadonlySet<string>): RejectReason | null => {
  const target = lookup(seq);
  if (target === null || !kinds.has(target.kind)) return 'not_found';
  return isTombstone(target.payload) ? 'gone' : null;
};

const SEED = new Set(['seed_planted']);

const payloadField = (cmd: FarmCommand, key: string): unknown =>
  (cmd.payload as Record<string, unknown>)[key];

/** The edit or unsend rules for a message of the writer's own. */
const ownTarget = (
  cmd: FarmCommand & { kind: 'edit' | 'unsend' },
  actor: PersonId,
  now: number,
  lookup: Lookup,
): RejectReason | null => {
  const target = lookup(cmd.payload.target);
  const allowed =
    cmd.kind === 'edit'
      ? target?.kind === 'message'
      : !NOT_UNSENDABLE.has(target?.kind ?? 'unsend');
  if (target === null || !allowed) return 'not_found';
  if (isTombstone(target.payload)) return 'gone';
  if (target.actor !== actor) return 'not_allowed';
  if (cmd.kind === 'edit') return now - target.at > EDIT_WINDOW_MS ? 'edit_window_closed' : null;
  // A slow post can be recalled until it arrives.
  const deliverAt = field(target, 'deliverAt');
  return typeof deliverAt === 'number' && deliverAt <= now ? 'not_allowed' : null;
};

/** Only the firefly left for you can be opened by you. */
const openFirefly = (seq: number, actor: PersonId, lookup: Lookup): RejectReason | null => {
  const target = lookup(seq);
  if (target === null || target.kind !== 'firefly') return 'not_found';
  if (isTombstone(target.payload)) return 'gone';
  return field(target, 'action') === 'left' && field(target, 'to') === actor ? null : 'not_found';
};

const SEED_KINDS = new Set(['seed_changed', 'vote', 'rsvp', 'checkin']);

export const checkTargets = (
  cmd: FarmCommand,
  actor: PersonId,
  now: number,
  lookup: Lookup,
): RejectReason | null => {
  const reply = payloadField(cmd, 'replyTo');
  if (typeof reply === 'number') {
    const target = lookup(reply);
    if (target === null || !CHAT_KINDS.has(target.kind)) return 'not_found';
  }
  if (cmd.kind === 'edit' || cmd.kind === 'unsend') return ownTarget(cmd, actor, now, lookup);
  if (cmd.kind === 'reaction' || cmd.kind === 'pin') {
    return pointsAt(lookup, cmd.payload.target, CHAT_KINDS);
  }
  if (cmd.kind === 'dewdrop' && cmd.payload.target !== undefined) {
    return pointsAt(lookup, cmd.payload.target, CHAT_KINDS);
  }
  if (cmd.kind === 'firefly' && cmd.payload.action === 'opened') {
    return openFirefly(cmd.payload.target, actor, lookup);
  }
  if (cmd.kind === 'scrapbook_page' && cmd.payload.action === 'hidden') {
    return pointsAt(lookup, cmd.payload.target, new Set(['scrapbook_page']));
  }
  const seed = payloadField(cmd, 'seed');
  if (typeof seed === 'number' && (SEED_KINDS.has(cmd.kind) || cmd.kind === 'scrapbook_page')) {
    return pointsAt(lookup, seed, SEED);
  }
  return null;
};
