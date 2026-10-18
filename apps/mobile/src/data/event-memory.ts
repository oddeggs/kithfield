import { FarmEvent, type FarmId } from '@kithfield/contracts';

import type { SyncStore } from './sync-store';

/**
 * A farm's recent events in memory, by seq, for the rules' synchronous lookups: the targets of
 * edits, unsends and pins when checking a write, and a restore's target. Also the restore targets
 * already paged in once.
 */
export function createEventMemory(cap = 500) {
  const recent = new Map<number, FarmEvent>();
  const remember = (event: FarmEvent): void => {
    recent.delete(event.seq);
    recent.set(event.seq, event);
    if (recent.size > cap) recent.delete(recent.keys().next().value ?? 0);
  };
  return {
    find: (seq: number): FarmEvent | undefined => recent.get(seq),
    /** Every event held, oldest first. */
    all: (): IterableIterator<FarmEvent> => recent.values(),
    remember,
    clear: () => recent.clear(),
    tried: new Set<number>(),
    /** Fills the memory from the cached log, newest last. */
    async load(store: SyncStore, farm: FarmId): Promise<void> {
      for (const e of await store.events(farm, { limit: cap })) {
        const parsed = e.known ? FarmEvent.safeParse(e) : null;
        if (parsed?.success) remember(parsed.data);
      }
    },
  };
}
