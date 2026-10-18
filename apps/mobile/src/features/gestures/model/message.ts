import { EDIT_WINDOW_MS } from '@kithfield/farm';
import { isTombstone } from '@kithfield/contracts';

/** An event of the farm's log as the phone holds it (the shape `useFarmEvents` reads). */
export interface LogEvent {
  readonly seq: number;
  readonly at: number;
  readonly day?: string | undefined;
  readonly actor: string | null;
  readonly kind: string;
  readonly payload: unknown;
}

const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null && key in payload
    ? (payload as Record<string, unknown>)[key]
    : undefined;

const str = (payload: unknown, key: string): string | null => {
  const v = field(payload, key);
  return typeof v === 'string' ? v : null;
};

const num = (payload: unknown, key: string): number | null => {
  const v = field(payload, key);
  return typeof v === 'number' ? v : null;
};

/** Kinds a long-press menu opens on. */
export const MENU_KINDS = new Set([
  'message',
  'quiet_note',
  'slow_post',
  'sticker',
  'media',
  'voice',
  'link',
]);

/** Kinds that can travel to another farm or visit, carrying `forwardedFrom`. */
export const FORWARDABLE = new Set(['message', 'sticker', 'media', 'voice', 'link']);

/** Kinds a plan can be planted from. */
const PLANTABLE = new Set(['message', 'quiet_note', 'link', 'media', 'voice']);

/**
 * The text an event shows, with its latest edit applied: a message's or a note's words, a link's
 * words or its address, a caption. Null when it has none (a sticker, a voice note).
 */
export function shownText(event: LogEvent, events: readonly LogEvent[]): string | null {
  if (isTombstone(event.payload)) return null;
  let edited: string | null = null;
  for (const e of events) {
    if (
      e.kind === 'edit' &&
      e.seq > event.seq &&
      e.actor === event.actor &&
      num(e.payload, 'target') === event.seq
    ) {
      edited = str(e.payload, 'text') ?? edited;
    }
  }
  if (edited !== null) return edited;
  if (event.kind === 'link') return str(event.payload, 'text') ?? str(event.payload, 'url');
  if (event.kind === 'media') return str(event.payload, 'caption');
  return str(event.payload, 'text');
}

/** A write still in this phone's outbox: yours, not yet in the farm's log. */
export interface PendingCare {
  readonly kind: string;
  readonly payload: unknown;
}

/**
 * The reaction this person has on an event now, or null: one per person, `null` took it back.
 * Reactions still in the outbox count, newest last, so a reopened menu shows what you just did.
 */
export function myReaction(
  events: readonly LogEvent[],
  pending: readonly PendingCare[],
  target: number,
  me: string,
): string | null {
  let current: string | null = null;
  const writes = [...events.filter((e) => e.actor === me), ...pending];
  for (const e of writes) {
    if (e.kind !== 'reaction' || num(e.payload, 'target') !== target) continue;
    current = str(e.payload, 'reaction');
  }
  return current;
}

/**
 * Whether this person already left a dewdrop on the event, in the log or still in the outbox:
 * one is all it needs.
 */
export const dewdropped = (
  events: readonly LogEvent[],
  pending: readonly PendingCare[],
  target: number,
  me: string,
): boolean =>
  [...events.filter((e) => e.actor === me), ...pending].some(
    (e) => e.kind === 'dewdrop' && num(e.payload, 'target') === target,
  );

/** The reactions this person has picked, oldest first, to order their tray. */
export const reactionsPicked = (events: readonly LogEvent[], me: string): string[] =>
  events
    .filter((e) => e.kind === 'reaction' && e.actor === me)
    .map((e) => str(e.payload, 'reaction'))
    .filter((r): r is string => r !== null);

/**
 * The write a tap in the reaction tray makes, or null when there is nothing to send: the dewdrop
 * goes once (a second would count care twice), a reaction toggles yours.
 */
export function reactionWrite(input: {
  readonly id: string;
  readonly target: number;
  readonly events: readonly LogEvent[];
  readonly pending: readonly PendingCare[];
  readonly me: string;
}): { kind: string; payload: unknown } | null {
  const { id, target, events, pending, me } = input;
  if (id === 'dewdrop') {
    return dewdropped(events, pending, target, me)
      ? null
      : { kind: 'dewdrop', payload: { target } };
  }
  const current = myReaction(events, pending, target, me);
  return { kind: 'reaction', payload: { target, reaction: current === id ? null : id } };
}

export type MenuAction =
  'reply' | 'edit' | 'pin' | 'unpin' | 'plant' | 'copy' | 'forward' | 'unsend' | 'report';

/** Whether the farm would take a write now: the data layer's dry run of the shared rules. */
export type CanWrite = (write: { kind: string; payload: unknown }) => boolean;

/**
 * The long-press menu for an event, in order: reply, edit, pin or take down, plant, copy, forward,
 * then unsend for your own or report for someone else's. What the farm would refuse (an edit after
 * its window, unsending a slow post that has arrived) is not offered: the shared rules decide.
 */
export function menuActions(input: {
  readonly event: LogEvent;
  readonly me: string;
  readonly text: string | null;
  readonly pinned: boolean;
  readonly can: CanWrite;
}): MenuAction[] {
  const { event, me, text, pinned, can } = input;
  if (isTombstone(event.payload) || !MENU_KINDS.has(event.kind)) return [];
  const target = event.seq;
  const mine = event.actor === me;
  const actions: MenuAction[] = [];
  if (can({ kind: 'message', payload: { text: text ?? '…', replyTo: target } })) {
    actions.push('reply');
  }
  if (mine && text && can({ kind: 'edit', payload: { target, text } })) actions.push('edit');
  if (can({ kind: 'pin', payload: { target, on: !pinned } }))
    actions.push(pinned ? 'unpin' : 'pin');
  const plan = { fromSeq: target, title: '…', days: [], place: null, yeses: 'most', someday: true };
  if (PLANTABLE.has(event.kind) && can({ kind: 'seed_planted', payload: plan })) {
    actions.push('plant');
  }
  if (text) actions.push('copy');
  if (FORWARDABLE.has(event.kind)) actions.push('forward');
  if (mine && can({ kind: 'unsend', payload: { target } })) actions.push('unsend');
  if (!mine) actions.push('report');
  return actions;
}

/**
 * When what the menu offers changes on its own: the edit window closing, a slow post arriving. The
 * menu looks again at each, so it never offers a write the farm would refuse.
 */
export function menuDeadlines(event: LogEvent): number[] {
  const deliverAt = num(event.payload, 'deliverAt');
  return [event.at + EDIT_WINDOW_MS, ...(deliverAt === null ? [] : [deliverAt])];
}
