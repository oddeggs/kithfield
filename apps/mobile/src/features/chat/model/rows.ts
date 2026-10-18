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
