import type { FarmId, Seq } from '@kithfield/contracts';
import { isTombstone } from '@kithfield/contracts';
import { useEffect, useState } from 'react';

import { useDataClient, useFarmSelector } from '../../data';

const lastSeqOf = (farm: { lastSeq: number } | null) => farm?.lastSeq ?? 0;

/** A message on a farm by seq, from the phone's copy of the log: its words, who wrote it and when. */
export function useMessage(farm: FarmId, fromSeq: Seq | null) {
  const client = useDataClient();
  const [found, setFound] = useState<{ text: string; actor: string | null; at: number } | null>(null);
  // Looked for again as the phone catches up, until the message is here.
  const lastSeq = useFarmSelector(farm, lastSeqOf);
  const have = found !== null;
  useEffect(() => {
    if (fromSeq === null || have || lastSeq < fromSeq) return;
    let live = true;
    void client.events(farm, { before: fromSeq + 1, limit: 1 }).then(([event]) => {
      if (!live || !event || event.seq !== fromSeq || event.kind !== 'message') return;
      const payload = event.payload;
      if (isTombstone(payload) || typeof payload !== 'object' || payload === null) return;
      const text = (payload as { text?: unknown }).text;
      if (typeof text === 'string') setFound({ text, actor: event.actor, at: event.at });
    });
    return () => {
      live = false;
    };
  }, [client, farm, fromSeq, have, lastSeq]);
  return found;
}
