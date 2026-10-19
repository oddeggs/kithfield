import type { FarmId, FarmList } from '@kithfield/contracts';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { useCottage, useDataClient, type DataClient } from '../../data';

export type FarmRow = FarmList['farms'][number];

export interface Valley {
  readonly status: 'loading' | 'ready' | 'failed';
  /** The farms (not visits) the person lives on, oldest first. */
  readonly farms: readonly FarmRow[];
  /** The farm the Farm tab shows. */
  readonly current: FarmId | null;
  /**
   * The farm the Farm tab showed last, when the person no longer lives there: left, or removed by
   * a keeper or the safety team. The farm home decides what to say about it.
   */
  readonly gone: FarmId | null;
}

/** The phone's own flags for the farm screens, in the data layer's encrypted `meta` table. */
const CURRENT = 'farm:current';
export const flagKey = (flag: string, farm: FarmId) => `farm:${flag}:${farm}`;

const LOADING: Valley = { status: 'loading', farms: [], current: null, gone: null };

/** The valley for one data client: the farm list, and which farm is open. */
class ValleyStore {
  private state: Valley = LOADING;
  private readonly listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  /** Farms left on this phone that the server may still list until the leaving lands. */
  private readonly leaving = new Set<FarmId>();

  constructor(private readonly client: DataClient) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = (): Valley => this.state;

  private set(next: Valley) {
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** Reads the farm list from the API; the open farm stays open while it is still in it. */
  refresh(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const [list, stored] = await Promise.all([
          this.client.api.farms(),
          this.client.store.meta(CURRENT),
        ]);
        for (const farm of this.leaving) {
          if (!list.farms.some((f) => f.farm === farm)) this.leaving.delete(farm);
        }
        const farms = list.farms
          .filter((f) => f.kind === 'farm' && !this.leaving.has(f.farm))
          .sort((a, b) => a.joinedAt - b.joinedAt);
        const want = this.state.current ?? stored;
        const here = farms.find((f) => f.farm === want);
        const current = here?.farm ?? farms[farms.length - 1]?.farm ?? null;
        const gone = want !== null && !here && !this.leaving.has(want) ? want : this.state.gone;
        this.set({ status: 'ready', farms, current, gone });
        if (current !== stored) await this.persist(current);
      } catch {
        if (this.state.status !== 'ready') this.set({ ...this.state, status: 'failed' });
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  private persist(farm: FarmId | null) {
    return this.client.store.transaction(() => this.client.store.setMeta(CURRENT, farm));
  }

  /** Opens another farm on the Farm tab. */
  async choose(farm: FarmId): Promise<void> {
    this.set({ ...this.state, current: farm });
    await this.persist(farm);
  }

  /** The person left `farm`: the tab opens the newest farm they still live on, if any. */
  async left(farm: FarmId): Promise<void> {
    this.leaving.add(farm);
    const farms = this.state.farms.filter((f) => f.farm !== farm);
    const current = farms[farms.length - 1]?.farm ?? null;
    this.set({ ...this.state, farms, current, gone: null });
    await this.persist(current);
  }

  /**
   * The farm turned the person away (not a member, or the farm is gone) before the farm list
   * caught up: the tab moves on, and the farm home decides what to say about it.
   */
  async lost(farm: FarmId): Promise<void> {
    if (!this.state.farms.some((f) => f.farm === farm)) return;
    const farms = this.state.farms.filter((f) => f.farm !== farm);
    const current = farms[farms.length - 1]?.farm ?? null;
    this.set({ ...this.state, farms, current, gone: farm });
    await this.persist(current);
  }

  /** The note about a farm the person left or was taken off has been seen. */
  forget(): void {
    if (this.state.gone !== null) this.set({ ...this.state, gone: null });
  }
}

const stores = new WeakMap<DataClient, ValleyStore>();

function storeFor(client: DataClient): ValleyStore {
  let store = stores.get(client);
  if (!store) {
    store = new ValleyStore(client);
    stores.set(client, store);
  }
  return store;
}

export interface ValleyControl extends Valley {
  refresh: () => Promise<void>;
  choose: (farm: FarmId) => Promise<void>;
  left: (farm: FarmId) => Promise<void>;
  lost: (farm: FarmId) => Promise<void>;
  forget: () => void;
}

/**
 * The farms the person lives on and the one the Farm tab shows. The list is read once and again
 * whenever the cottage's chat list gains or loses a farm (a join, a new farm, a leaving).
 */
export function useValley(): ValleyControl {
  const client = useDataClient();
  const store = storeFor(client);
  const valley = useSyncExternalStore(store.subscribe, store.get);
  const { chats } = useCottage();
  const farmIds = chats
    .filter((c) => c.farmKind === 'farm')
    .map((c) => c.farm)
    .sort()
    .join(',');
  useEffect(() => {
    void store.refresh();
  }, [store, farmIds]);
  const refresh = useCallback(() => store.refresh(), [store]);
  const choose = useCallback((farm: FarmId) => store.choose(farm), [store]);
  const left = useCallback((farm: FarmId) => store.left(farm), [store]);
  const lost = useCallback((farm: FarmId) => store.lost(farm), [store]);
  const forget = useCallback(() => store.forget(), [store]);
  return { ...valley, refresh, choose, left, lost, forget };
}

/** A flag of the phone's own about a farm (seen once, and the like). */
export function useFarmFlags(farm: FarmId) {
  const client = useDataClient();
  const read = useCallback(
    (flag: string) => client.store.meta(flagKey(flag, farm)),
    [client, farm],
  );
  const write = useCallback(
    (flag: string, value: string | null) =>
      client.store.transaction(() => client.store.setMeta(flagKey(flag, farm), value)),
    [client, farm],
  );
  return useMemo(() => ({ read, write }), [read, write]);
}
