import { isTombstone } from '@kithfield/contracts';

import { FORWARDABLE, type LogEvent } from './message';

/** At most this many farms and visits at once. */
export const FORWARD_LIMIT = 5;

/** What a forward writes on each farm it goes to: the same kind, carrying where it came from. */
export interface ForwardWrite {
  readonly kind: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Keys that belong to the original farm and never travel: replies and mentions point into it, and
 * the friends drawn into a together sticker are that farm's.
 */
const STAYS_HOME = new Set(['replyTo', 'mentions', 'forwardedFrom', 'with']);

/** Why a message can't be forwarded: unsent or not a kind that travels, or carries stored media. */
export type Unforwardable = 'gone' | 'media';

/**
 * Whether a message carries media stored on its farm: photos, video, files, a voice note, a link's
 * preview image. Those keys are the farm's own, so for now such messages stay where they are.
 */
export function carriesMedia(event: LogEvent): boolean {
  if (event.kind === 'media' || event.kind === 'voice') return true;
  if (event.kind !== 'link') return false;
  const preview = (event.payload as { preview?: { image?: unknown } } | null)?.preview;
  return preview?.image !== undefined;
}

/** Why an event can't be forwarded, or null when it can. */
export function unforwardable(event: LogEvent): Unforwardable | null {
  if (!FORWARDABLE.has(event.kind) || isTombstone(event.payload)) return 'gone';
  return carriesMedia(event) ? 'media' : null;
}

/**
 * The write that forwards an event, with `forwardedFrom` naming the farm and seq it came from, or
 * null when it can't travel (see `unforwardable`). The text is the latest edit's when there is one.
 */
export function forwardWrite(
  event: LogEvent,
  from: { readonly farm: string; readonly text: string | null },
): ForwardWrite | null {
  if (unforwardable(event) !== null) return null;
  if (typeof event.payload !== 'object' || event.payload === null) return null;
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event.payload)) if (!STAYS_HOME.has(k)) payload[k] = v;
  if (event.kind === 'message' && from.text !== null) payload['text'] = from.text;
  payload['forwardedFrom'] = { farm: from.farm, seq: event.seq };
  return { kind: event.kind, payload };
}

/** Toggles a farm in the picked list, keeping the limit. Answers the list unchanged when full. */
export function togglePick(picked: readonly string[], farm: string): string[] {
  if (picked.includes(farm)) return picked.filter((f) => f !== farm);
  if (picked.length >= FORWARD_LIMIT) return [...picked];
  return [...picked, farm];
}
