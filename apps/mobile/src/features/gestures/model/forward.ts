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

/** Why a message can't be forwarded: unsent, or not a kind that travels. */
export type Unforwardable = 'gone';

/** Why an event can't be forwarded, or null when it can. */
export function unforwardable(event: LogEvent): Unforwardable | null {
  return !FORWARDABLE.has(event.kind) || isTombstone(event.payload) ? 'gone' : null;
}

interface Ref {
  readonly key: string;
}

const isRef = (v: unknown): v is Ref =>
  typeof v === 'object' && v !== null && typeof (v as { key?: unknown }).key === 'string';

/**
 * The stored media a write carries, by key: photos, video and files, a voice note, a link's
 * preview image. Those keys belong to the farm they were sent on, so a forward copies them first.
 */
export function mediaKeysOf(payload: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const items = payload['items'];
  if (Array.isArray(items)) for (const i of items) if (isRef(i)) keys.push(i.key);
  if (isRef(payload['audio'])) keys.push(payload['audio'].key);
  const preview = payload['preview'];
  if (typeof preview === 'object' && preview !== null) {
    const image = (preview as { image?: unknown }).image;
    if (isRef(image)) keys.push(image.key);
  }
  return keys;
}

/**
 * The write with each media key swapped for its copy on the farm it's going to, or null when a
 * key has no copy (it must never point back at the original farm).
 */
export function withCopiedKeys(
  write: ForwardWrite,
  copies: Readonly<Record<string, string>>,
): ForwardWrite | null {
  let missing = false;
  const swap = (v: unknown): unknown => {
    if (!isRef(v)) return v;
    const key = copies[v.key];
    if (key === undefined) missing = true;
    return { ...v, key: key ?? v.key };
  };
  const payload = { ...write.payload };
  if (Array.isArray(payload['items'])) payload['items'] = (payload['items'] as unknown[]).map(swap);
  if (payload['audio'] !== undefined) payload['audio'] = swap(payload['audio']);
  const preview = payload['preview'];
  if (typeof preview === 'object' && preview !== null && 'image' in preview) {
    payload['preview'] = { ...preview, image: swap((preview).image) };
  }
  return missing ? null : { kind: write.kind, payload };
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
