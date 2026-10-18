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

/** The reaction this person has on an event now, or null. One per person; `null` took it back. */
export function myReaction(events: readonly LogEvent[], target: number, me: string): string | null {
  let current: string | null = null;
  for (const e of events) {
    if (e.kind !== 'reaction' || e.actor !== me || num(e.payload, 'target') !== target) continue;
    current = str(e.payload, 'reaction');
  }
  return current;
}

/** Whether this person already left a dewdrop on the event: one is all it needs. */
export const dewdropped = (events: readonly LogEvent[], target: number, me: string): boolean =>
  events.some((e) => e.kind === 'dewdrop' && e.actor === me && num(e.payload, 'target') === target);

/** The reactions this person has picked, oldest first, to order their tray. */
export const reactionsPicked = (events: readonly LogEvent[], me: string): string[] =>
  events
    .filter((e) => e.kind === 'reaction' && e.actor === me)
    .map((e) => str(e.payload, 'reaction'))
    .filter((r): r is string => r !== null);

export type MenuAction =
  'reply' | 'edit' | 'pin' | 'unpin' | 'plant' | 'copy' | 'forward' | 'unsend' | 'report';

/** Whether a message can still be edited: messages only, for 15 minutes after sending. */
export const editOpen = (event: LogEvent, now: number): boolean =>
  event.kind === 'message' && now - event.at <= EDIT_WINDOW_MS;

/** Whether the writer can still take it back: any time, but a slow post only until it arrives. */
export function canUnsend(event: LogEvent, now: number): boolean {
  if (event.kind !== 'slow_post') return true;
  const deliverAt = num(event.payload, 'deliverAt');
  return deliverAt === null || deliverAt > now;
}

/**
 * The long-press menu for an event, in order. Your own: reply, edit (15 minutes), pin, plant,
 * copy, forward, unsend. Someone else's: reply, pin, plant, copy, forward, report.
 */
export function menuActions(input: {
  readonly event: LogEvent;
  readonly me: string;
  readonly now: number;
  readonly pinned: boolean;
  readonly hasText: boolean;
}): MenuAction[] {
  const { event, me, now, pinned, hasText } = input;
  if (isTombstone(event.payload) || !MENU_KINDS.has(event.kind)) return [];
  const mine = event.actor === me;
  const actions: MenuAction[] = ['reply'];
  if (mine && editOpen(event, now)) actions.push('edit');
  actions.push(pinned ? 'unpin' : 'pin');
  if (PLANTABLE.has(event.kind)) actions.push('plant');
  if (hasText) actions.push('copy');
  if (FORWARDABLE.has(event.kind)) actions.push('forward');
  if (mine && canUnsend(event, now)) actions.push('unsend');
  if (!mine) actions.push('report');
  return actions;
}
