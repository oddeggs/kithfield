import type { Critter } from '@kithfield/contracts';
import { useEffect, useMemo, useState } from 'react';

import { useArt } from '../../../ui/art/art-provider';
import { useLocale } from '../../../ui/locale/locale-provider';
import { syncMessages } from './messages';
import { ownPack } from './pack';

export type MessagesState = 'checking' | 'on' | 'updating' | 'unavailable';

/**
 * Keeps the Messages drawer wearing what the critter wears now: whenever the pack's drawing
 * changes (an outfit, a coat, the language) it is baked again into the App Group, behind the
 * screen, a frame at a time when the JS thread is idle.
 */
export function useMessagesSync(me: {
  readonly name: string | null;
  readonly critter: Critter | null;
}): {
  readonly state: MessagesState;
  readonly progress: number;
} {
  const store = useArt();
  const { t } = useLocale();
  const critter = me.critter;
  const stickers = useMemo(
    () => (critter ? ownPack(t, { name: me.name, critter }) : null),
    [t, me.name, critter],
  );
  const key = JSON.stringify(stickers?.map((s) => s.attrs) ?? null);
  const [state, setState] = useState<MessagesState>('checking');
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (stickers === null) return;
    let stop = false;
    setState('checking');
    syncMessages(
      store.art,
      stickers,
      (done, total) => {
        if (stop) return;
        setProgress(total > 0 ? done / total : 0);
        if (done < total) setState('updating');
      },
      () => stop,
    ).then(
      (result) => {
        if (stop) return;
        setState(result === 'unavailable' ? 'unavailable' : 'on');
      },
      () => !stop && setState('unavailable'),
    );
    return () => {
      stop = true;
    };
    // The pack's drawing is the key: the same stickers drawn the same need nothing.
  }, [store, key]);
  return { state, progress };
}
