import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useArt } from '../../../ui/art/art-provider';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useMe } from '../ui/use-me';
import { syncMessages } from './messages';
import { ownPack } from './pack';

export type MessagesState = 'checking' | 'on' | 'updating' | 'unavailable';

/**
 * Keeps the Messages drawer wearing what the critter wears now, for as long as it is mounted
 * (the export screen; an app-level host for the whole session). The person's critter is read
 * again whenever the app comes back to the foreground, and when the pack's drawing changed (an
 * outfit, a coat, the language) it is made again into the App Group, behind the screen, a frame
 * at a time when the JS thread is idle, through the one bake queue.
 */
export function useMessagesSync(): {
  readonly state: MessagesState;
  readonly progress: number;
} {
  const store = useArt();
  const { t } = useLocale();
  const me = useMe();
  const { refresh, critter, name } = me;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  const stickers = useMemo(
    () => (critter ? ownPack(t, { name, critter }) : null),
    [t, name, critter],
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
