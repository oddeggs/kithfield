import type { BlockList, PersonId } from '@kithfield/contracts';
import { useSyncExternalStore } from 'react';

type Blocked = BlockList['blocked'][number];

/** The blocking routes: `GET /v1/blocks`, `PUT` and `DELETE /v1/blocks/:person`. */
export interface BlocksPort {
  list(): Promise<BlockList>;
  block(person: PersonId): Promise<void>;
  unblock(person: PersonId): Promise<void>;
}

export interface BlocksState {
  readonly blocked: readonly Blocked[];
  readonly people: ReadonlySet<PersonId>;
}

const EMPTY: BlocksState = { blocked: [], people: new Set() };

/**
 * The people this person blocked, cached from the server. Blocking and unblocking show at once and
 * are taken back if the server refuses. Nobody is ever told either way.
 */
export function createBlocks(port: BlocksPort, now: () => number = Date.now) {
  let state = EMPTY;
  const listeners = new Set<() => void>();
  const set = (blocked: readonly Blocked[]) => {
    state = { blocked, people: new Set(blocked.map((b) => b.person)) };
    for (const listener of listeners) listener();
  };
  const without = (person: PersonId) => state.blocked.filter((b) => b.person !== person);
  return {
    getState: (): BlocksState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isBlocked: (person: PersonId) => state.people.has(person),
    async refresh(): Promise<void> {
      set((await port.list()).blocked);
    },
    async block(who: Omit<Blocked, 'at'>): Promise<void> {
      if (state.people.has(who.person)) return;
      set([{ ...who, at: now() }, ...state.blocked]);
      try {
        await port.block(who.person);
      } catch (error) {
        set(without(who.person));
        throw error;
      }
    },
    async unblock(person: PersonId): Promise<void> {
      const before = state.blocked.find((b) => b.person === person);
      if (!before) return;
      set(without(person));
      try {
        await port.unblock(person);
      } catch (error) {
        set([...state.blocked, before].sort((a, b) => b.at - a.at));
        throw error;
      }
    },
  };
}

export type Blocks = ReturnType<typeof createBlocks>;

let shared: Blocks | null = null;

/** Connects the phone's one block list to the server, once; later calls reuse it. */
export function connectBlocks(port: BlocksPort): Blocks {
  shared ??= createBlocks(port);
  return shared;
}

/** Whether this person blocked someone, for callers outside React (filters, the gate). */
export const isBlocked = (person: PersonId): boolean => shared?.isBlocked(person) ?? false;

const noSubscribe = () => () => undefined;

/** The people blocked, re-rendering when the list changes. */
export function useBlocked(): BlocksState {
  return useSyncExternalStore(shared?.subscribe ?? noSubscribe, () => shared?.getState() ?? EMPTY);
}
