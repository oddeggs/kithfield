import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { HINTS, afterOk, isDue, seenFrom, type Hint } from './hint-order';

export type { Hint } from './hint-order';

/** On this phone, not the person: a new phone shows the tips again, a new sign-in doesn't. */
const KEY = 'kithfield.hints.next';

/** How many tips are behind the person; `HINTS.length` once all are seen or skipped. */
let next: number | null = null;
const listeners = new Set<() => void>();

function read(): number {
  if (next !== null) return next;
  try {
    next = seenFrom(SecureStore.getItem(KEY));
  } catch {
    // A phone that can't say: never nag.
    next = HINTS.length;
  }
  return next;
}

function write(n: number): void {
  next = n;
  for (const l of listeners) l();
  void SecureStore.setItemAsync(KEY, String(n)).catch(() => undefined);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export interface HintState {
  /** This tip is the one to show now. */
  readonly due: boolean;
  /** Its place among the tips, from 1. */
  readonly n: number;
  readonly total: number;
  /** Seen: on to the next tip. */
  readonly ok: () => void;
  /** No more tips on this phone. */
  readonly skip: () => void;
}

/** Whether `hint` is due, and how to put it away. */
export function useHint(hint: Hint): HintState {
  const seen = useSyncExternalStore(subscribe, read);
  const index = HINTS.indexOf(hint);
  return {
    due: isDue(seen, hint),
    n: index + 1,
    total: HINTS.length,
    ok: () => {
      const seenNow = read();
      const after = afterOk(seenNow, hint);
      if (after !== seenNow) write(after);
    },
    skip: () => write(HINTS.length),
  };
}
