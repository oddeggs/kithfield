import { EDIT_WINDOW_MS } from '@kithfield/farm';

import type { BubbleBody, TimelineItem } from './timeline';

/**
 * Where a message sits in the chat's rows: its bubble, the gap it left when unsent, or its line.
 * -1 when the phone hasn't loaded it yet, so the chat pages further back.
 */
export function rowIndexOf(rows: readonly TimelineItem[], seq: number): number {
  return rows.findIndex((r) => r.type !== 'day' && r.seq === seq);
}

/** Your own message, landed, in words, within 15 minutes of sending: the farm takes its edit. */
export function canEdit(
  item: {
    readonly mine: boolean;
    readonly seq: number | null;
    readonly at: number;
    readonly body: BubbleBody | { readonly kind: string; readonly text: string };
  },
  now: number,
): boolean {
  return (
    item.mine &&
    item.seq !== null &&
    item.body.kind === 'message' &&
    now - item.at <= EDIT_WINDOW_MS
  );
}

/**
 * The room to leave above the oldest row, so that scrolled to its end the oldest row sits right
 * under the header however far the header has folded (it folds 1:1 with the scroll, up to
 * `collapse`). `full` is the room under the unfolded header; `rows` is the height of everything
 * else in the list; `viewport` is the list's height.
 */
export function topRoom(full: number, collapse: number, rows: number, viewport: number): number {
  const over = rows - viewport;
  // Short enough that it never scrolls: the whole header stands over it.
  if (over <= -full) return full;
  // Long enough to fold the header all the way.
  if (over >= 2 * collapse - full) return full - collapse;
  // In between, the room and the fold meet: room = full - (over + room).
  return (full - over) / 2;
}
