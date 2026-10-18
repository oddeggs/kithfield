import type { FarmId } from '@kithfield/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { failure } from './apply-events';
import type { CottageState } from './cottage-connection';
import type { DataClient, DataStatus } from './data-client';
import type { NetworkSwitch } from './dev-network';
import type { FarmLink } from './farm-connection';
import type { EnqueueResult, FarmReplica, FarmReplicaState } from './farm-replica';
import type { CommandCheck, FarmRules } from './farm-rules';
import type { PresenceState } from './presence-store';
import { createSelection } from './selection';
import type { StoredEvent, StoredRejection } from './sync-store';

interface DataContextValue {
  readonly client: DataClient;
  readonly rules: FarmRules<unknown>;
  readonly network: NetworkSwitch | null;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Puts the data client (made once, at startup) and the farm rules under the app. */
export function DataProvider(props: {
  readonly client: DataClient;
  readonly rules: FarmRules<unknown>;
  /** The development network switch (`DataRuntime.network`), when there is one. */
  readonly network?: NetworkSwitch | null;
  readonly children: ReactNode;
}) {
  const { client, rules, network = null, children } = props;
  const value = useMemo(() => ({ client, rules, network }), [client, rules, network]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData needs a DataProvider above it');
  return value;
}

/** The data client itself, for what the hooks below don't cover. */
export function useDataClient(): DataClient {
  return useData().client;
}

const noSubscribe = () => () => undefined;
const nothing = () => null;

function useReplica(farm: FarmId): FarmReplica | null {
  const { client } = useData();
  const [replica, setReplica] = useState<FarmReplica | null>(null);
  useEffect(() => {
    let live = true;
    setReplica(null);
    client.replica(farm).then(
      (r) => live && setReplica(r),
      (error: unknown) => client.report(failure('hook.replica', error)),
    );
    return () => {
      live = false;
    };
  }, [client, farm]);
  return replica;
}

/** Keeps the farm's socket open while the calling screen is mounted. */
export function useOpenFarm(farm: FarmId): void {
  const client = useDataClient();
  useEffect(() => client.hold(farm), [client, farm]);
}

/**
 * A farm as the phone holds it, with pending writes drawn in; null until read from SQLite.
 * Re-renders on every change to it.
 */
export function useFarm(farm: FarmId): FarmReplicaState | null {
  const replica = useReplica(farm);
  return useSyncExternalStore(replica?.subscribe ?? noSubscribe, replica?.getState ?? nothing);
}

/**
 * One piece of a farm, re-rendering only when that piece changes (by `isEqual`). Keep `selector`
 * stable (outside the component or in `useCallback`), or it runs on every render.
 */
export function useFarmSelector<T>(
  farm: FarmId,
  selector: (farm: FarmReplicaState | null) => T,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const replica = useReplica(farm);
  const selection = useRef(createSelection<FarmReplicaState | null, T>(isEqual)).current;
  return useSyncExternalStore(replica?.subscribe ?? noSubscribe, () =>
    selection(replica?.getState() ?? null, selector),
  );
}

const NOBODY: PresenceState = { here: [], typing: [] };

/** Who has the farm open and who is writing. Kept apart from the farm, so it re-renders alone. */
export function usePresence(farm: FarmId): PresenceState {
  const replica = useReplica(farm);
  return useSyncExternalStore(
    replica?.presence.subscribe ?? noSubscribe,
    replica?.presence.getState ?? (() => NOBODY),
  );
}

/** What the farm looks like at `now` (sleepy, misty and the rest), from the shared rules. */
export function useFarmView<View>(farm: FarmId, now: number): View | null {
  const { rules } = useData();
  const state = useFarm(farm)?.state ?? null;
  return useMemo(() => (state ? (rules.farmView(state, now) as View) : null), [rules, state, now]);
}

/** The newest cached events of a farm, oldest first, refreshed whenever the farm changes. */
export function useFarmEvents(farm: FarmId, limit = 50): readonly StoredEvent[] {
  const client = useDataClient();
  const lastSeq = useFarm(farm)?.lastSeq;
  const [events, setEvents] = useState<readonly StoredEvent[]>([]);
  useEffect(() => {
    let live = true;
    client.events(farm, { limit }).then(
      (rows) => live && setEvents(rows),
      (error: unknown) => client.report(failure('hook.events', error)),
    );
    return () => {
      live = false;
    };
  }, [client, farm, limit, lastSeq]);
  return events;
}

/** How the farm's link to the server stands. */
export function useFarmLink(farm: FarmId): FarmLink {
  const client = useDataClient();
  return useSyncExternalStore(client.subscribe, () => client.link(farm));
}

/**
 * A dry run of a write: whether the farm would take it from `actor` now, by the same shared rules
 * `useSend` runs (null until the farm is read from SQLite). Re-renders whenever the farm changes,
 * so what a screen offers follows the farm.
 */
export function useCanWrite(
  farm: FarmId,
): ((actor: string, write: { kind: string; payload: unknown }) => CommandCheck) | null {
  const replica = useReplica(farm);
  const state = useSyncExternalStore(
    replica?.subscribe ?? noSubscribe,
    replica?.getState ?? nothing,
  );
  // A new function on every change of the farm, so memoised readers check again.
  return useMemo(
    () => (replica && state ? (actor, write) => replica.canWrite(actor, write) : null),
    [replica, state],
  );
}

/** A function that makes a write on a farm. */
export function useSend(farm: FarmId): (kind: string, payload: unknown) => Promise<EnqueueResult> {
  const client = useDataClient();
  return useCallback((kind, payload) => client.send(farm, kind, payload), [client, farm]);
}

/** The chat list, the cottage's link and whether a safety note waits. */
export function useCottage(): CottageState {
  const { cottage } = useDataClient();
  return useSyncExternalStore(cottage.subscribe, cottage.getState);
}

/** Writes the farm refused, until dismissed with `useDataClient().dismissRejection`. */
export function useRejections(): readonly StoredRejection[] {
  const client = useDataClient();
  return useSyncExternalStore(client.subscribe, client.rejections);
}

/** Whether the session ended (offer sign-in) or the person is banned. */
export function useDataStatus(): DataStatus {
  const client = useDataClient();
  return useSyncExternalStore(client.subscribe, client.status);
}

const online = () => false;

/**
 * The development network switch and whether it is off; null in release builds. Cuts the data
 * layer's sockets and requests, for trying the outbox and catch-up on a simulator.
 */
export function useNetworkSwitch(): { network: NetworkSwitch; offline: boolean } | null {
  const { network } = useData();
  const offline = useSyncExternalStore(
    network ? (listener: () => void) => network.subscribe(listener) : noSubscribe,
    network ? () => network.offline() : online,
  );
  return network ? { network, offline } : null;
}
