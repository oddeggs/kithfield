import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The clock the farm is drawn at: sleepy, misty and status bubbles are worked out from it. It
 * moves on every `stepMs` and when the app comes back to the front.
 */
export function useNow(stepMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), stepMs);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [stepMs]);
  return now;
}

/** Runs `fn` when the JS thread is idle, so baking art never holds up a screen's first frame. */
export function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn);
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}
