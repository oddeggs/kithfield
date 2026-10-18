import { FarmEvent, isTombstone, type FarmKind, type PersonId } from '@kithfield/contracts';

import { mediaKeys } from './content';
import type { FarmHost } from './host';

/*
 * A person's share of a farm for their keepsakes export: what they wrote here (as last edited)
 * and the media they shared. Never anyone else's words. Unsent and removed things are tombstones
 * and give nothing.
 */

/** One thing the person wrote or shared. */
export type ExportItem = {
  seq: number;
  at: number;
  kind: string;
  text: string | null;
  url: string | null;
  media: string[];
};

export type FarmExport = {
  farm: string;
  kind: FarmKind;
  name: string | null;
  items: ExportItem[];
};

/** Kinds whose words or media are the person's own keepsakes. */
const KEPT_KINDS = new Set([
  'message',
  'quiet_note',
  'link',
  'media',
  'voice',
  'slow_post',
  'card_signed',
]);

const wordsOf = (event: FarmEvent): string | null => {
  if (isTombstone(event.payload)) return null;
  if (
    event.kind === 'message' ||
    event.kind === 'quiet_note' ||
    event.kind === 'slow_post' ||
    event.kind === 'card_signed'
  ) {
    return event.payload.text;
  }
  if (event.kind === 'link') return event.payload.text ?? null;
  if (event.kind === 'media') return event.payload.caption ?? null;
  return null;
};

/** The person's keepsakes on this farm; null when the farm has none of their writing. */
export const exportOf = (host: FarmHost, person: PersonId): FarmExport | null => {
  const state = host.farm.state;
  if (state === null) return null;
  const items: ExportItem[] = [];
  for (const envelope of host.store.byActor(host.farm.actorOf(person))) {
    if (!KEPT_KINDS.has(envelope.kind) || isTombstone(envelope.payload)) continue;
    const parsed = FarmEvent.safeParse(envelope);
    if (!parsed.success) continue;
    const event = parsed.data;
    let text = wordsOf(event);
    if (event.kind === 'message') {
      // The message as last edited; an edit that was itself removed is a tombstone and skipped.
      for (const edit of host.store.pointingAt('edit', event.seq)) {
        const payload = edit.payload as { text?: unknown };
        if (!isTombstone(edit.payload) && typeof payload.text === 'string') text = payload.text;
      }
    }
    items.push({
      seq: event.seq,
      at: event.at,
      kind: event.kind,
      text,
      url: event.kind === 'link' && !isTombstone(event.payload) ? event.payload.url : null,
      // Only this farm's own media: a key under another farm's prefix is never the person's here.
      media: mediaKeys(event).filter((key) => key.startsWith(`farm/${state.farm}/`)),
    });
  }
  return { farm: state.farm, kind: state.kind, name: state.name, items };
};
