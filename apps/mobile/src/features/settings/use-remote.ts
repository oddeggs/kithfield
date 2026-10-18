import { useCallback, useEffect, useRef, useState } from 'react';

export interface Remote<T> {
  /** The last answer, kept while a reload runs. */
  readonly data: T | null;
  /** The last load failed (and nothing newer arrived). */
  readonly failed: boolean;
  readonly loading: boolean;
  readonly reload: () => void;
  /** Draws a change at once, before the server's answer (optimistic). */
  readonly set: (update: (current: T) => T) => void;
}

/**
 * Something read from the API for a screen: loaded on mount and on `reload`, an older answer
 * never overwriting a newer one. `key` reloads when it changes.
 */
export function useRemote<T>(load: () => Promise<T>, key: string = ''): Remote<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let live = true;
    setLoading(true);
    loadRef.current().then(
      (value) => {
        if (!live) return;
        setData(value);
        setFailed(false);
        setLoading(false);
      },
      () => {
        if (!live) return;
        setFailed(true);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [key, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const set = useCallback(
    (update: (current: T) => T) => setData((d) => (d === null ? d : update(d))),
    [],
  );
  return { data, failed, loading, reload, set };
}
