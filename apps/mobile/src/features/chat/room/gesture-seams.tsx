import { useMemo } from 'react';

import { reactionRow } from '../../gestures';
import type { BubbleItem } from '../model/timeline';
import { useBlockedIds } from '../ui/blocked';
import { Reactions } from './reactions';
import { useRoom } from './room-context';

/*
 * Where the gestures feature's pieces plug into the chat: the marks under a message (its
 * `reactionRow()`) and a file in a message (its `FileBubble`).
 */

/**
 * The dewdrops and reactions under a bubble: which marks, in which order, as the gestures feature
 * reads them from the farm's events, leaving out what someone you blocked left and any dewdrop
 * taken back.
 */
export function ReactionRow({ item }: { readonly item: BubbleItem }) {
  const room = useRoom();
  const blocked = useBlockedIds();
  const hasMarks = item.dew.length > 0 || item.reactions.length > 0;
  // The row re-renders when its item does, which changes whenever a mark on it does.
  const marks = useMemo(() => {
    if (item.seq === null || !hasMarks) return [];
    const events = room.events();
    const unsent = new Set<number>();
    for (const e of events) {
      const target = (e.payload as { target?: unknown } | null)?.target;
      if (e.kind === 'unsend' && typeof target === 'number') unsent.add(target);
    }
    const kept = events.filter(
      (e) => !unsent.has(e.seq) && (e.actor === null || !blocked.has(e.actor)),
    );
    return reactionRow(kept, item.seq, room.me);
  }, [item, hasMarks, room, blocked]);
  return <Reactions item={item} marks={marks} />;
}

export { FileBubble, type FileBubbleProps } from '../../gestures';
