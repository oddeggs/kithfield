import { isTombstone } from '@kithfield/contracts';

import { FORWARDABLE, type LogEvent } from './message';

/** At most this many farms and visits at once. */
export const FORWARD_LIMIT = 5;

/** What a forward writes on each farm it goes to: the same kind, carrying where it came from. */
export interface ForwardWrite {
  readonly kind: string;
  readonly payload: Record<string, unknown>;
}

/** Keys that belong to the original farm and never travel: replies and mentions point into it. */
const STAYS_HOME = new Set(['replyTo', 'mentions', 'forwardedFrom']);

/**
 * The write that forwards an event, with `forwardedFrom` naming the farm and seq it came from, or
 * null when it can't travel (an unsent message, a kind that isn't forwardable). The text is the
 * latest edit's when there is one.
 */
export function forwardWrite(
  event: LogEvent,
  from: { readonly farm: string; readonly text: string | null },
): ForwardWrite | null {
  if (!FORWARDABLE.has(event.kind) || isTombstone(event.payload)) return null;
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
