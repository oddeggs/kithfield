import type { PersonId } from '@kithfield/contracts';

/** Who has the farm open and who is writing. Never stored; a new object on every change. */
export interface PresenceState {
  readonly here: readonly PersonId[];
  readonly typing: readonly PersonId[];
}

const NOBODY: PresenceState = { here: [], typing: [] };

/**
 * A farm's presence, kept apart from the farm itself so a typing dot never re-renders what reads
 * the farm.
 */
export function createPresenceStore() {
  let state = NOBODY;
  const listeners = new Set<() => void>();
  const set = (change: Partial<PresenceState>) => {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  };
  return {
    getState: (): PresenceState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    here: (here: readonly PersonId[]) => set({ here }),
    typing: (typing: readonly PersonId[]) => set({ typing }),
    /** The socket closed: nobody is known to be here. */
    clear: () => set(NOBODY),
  };
}

export type PresenceStore = ReturnType<typeof createPresenceStore>;
