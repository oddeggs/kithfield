import { type FarmEvent, isTombstone, type PersonId } from '@kithfield/contracts';

/*
 * What the farm reads out of an event's content: the media it points at (deleted with it), the
 * words it indexes for search, the chat-list preview, and whom it is meant for. Tombstones have no
 * content, so they give nothing.
 */

/** R2 keys an event's payload points at. */
export const mediaKeys = (event: FarmEvent): string[] => {
  if (isTombstone(event.payload)) return [];
  if (event.kind === 'media') return event.payload.items.map((item) => item.key);
  if (event.kind === 'voice') return [event.payload.audio.key];
  if (event.kind === 'link' && event.payload.preview?.image !== undefined) {
    return [event.payload.preview.image.key];
  }
  return [];
};

/**
 * The words search finds an event by. Slow posts are left out: they stay sealed until delivered.
 * An edit's words are indexed under the message it edits.
 */
export const searchText = (event: FarmEvent): string | null => {
  if (isTombstone(event.payload)) return null;
  if (event.kind === 'message' || event.kind === 'quiet_note' || event.kind === 'edit') {
    return event.payload.text;
  }
  if (event.kind === 'link') {
    const { text, preview, url } = event.payload;
    return [text, preview?.title, url].filter((part) => part !== undefined).join(' ');
  }
  if (event.kind === 'media') return event.payload.caption ?? null;
  if (event.kind === 'seed_planted') return event.payload.title;
  return null;
};

const PREVIEW_MAX = 140;

const wordsOf = (event: FarmEvent): string | undefined => {
  if (isTombstone(event.payload)) return undefined;
  if (event.kind === 'message' || event.kind === 'quiet_note') return event.payload.text;
  if (event.kind === 'link') return event.payload.text ?? event.payload.url;
  if (event.kind === 'media') return event.payload.caption;
  if (event.kind === 'seed_planted') return event.payload.title;
  return undefined;
};

/** A short line for the chat list, or null when the event has no words to show. */
export const previewOf = (event: FarmEvent): string | null => {
  const line = wordsOf(event)?.replace(/\s+/g, ' ').trim() ?? '';
  if (line === '') return null;
  const chars = Array.from(line);
  if (chars.length <= PREVIEW_MAX) return line;
  return `${chars
    .slice(0, PREVIEW_MAX - 1)
    .join('')
    .trimEnd()}…`;
};

const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)[key]
    : undefined;

/** Kinds whose payload names the person it is for in `to`. */
const ADDRESSED = new Set(['dewdrop', 'wave', 'knock', 'hug', 'slow_post', 'card_signed']);

/** The person an event is addressed to, if any. */
const addressee = (event: FarmEvent): unknown => {
  if (isTombstone(event.payload)) return undefined;
  if (ADDRESSED.has(event.kind)) return field(event.payload, 'to');
  if (event.kind === 'firefly' && event.payload.action === 'left') return event.payload.to;
  if (event.kind === 'gift' && event.payload.action === 'given') return event.payload.to;
  if (event.kind === 'gate') return field(event.payload.gesture, 'to');
  return undefined;
};

/** The seq an event replies to, if any. */
export const replyTarget = (event: FarmEvent): number | undefined => {
  const reply = isTombstone(event.payload) ? undefined : field(event.payload, 'replyTo');
  return typeof reply === 'number' ? reply : undefined;
};

/**
 * Whether an event is meant for this member: addressed to them, a mention of them, or a reply to
 * something they wrote. Never their own event.
 */
export const isForYou = (
  event: FarmEvent,
  member: PersonId,
  repliedTo: PersonId | null,
): boolean => {
  if (event.actor === member) return false;
  if (addressee(event) === member) return true;
  if (event.kind === 'message' && !isTombstone(event.payload)) {
    if (event.payload.mentions?.includes(member) === true) return true;
  }
  return repliedTo === member;
};
