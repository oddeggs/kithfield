import type { FarmId, OpId, PersonId } from '@kithfield/contracts';

import type { SqlDatabase } from '../db/sql';
import type { ApiClient } from './api-client';
import type { BackoffOptions } from './backoff';
import { createCottageConnection, type CottageConnection } from './cottage-connection';
import { createFarmConnection, type FarmConnection, type FarmLink } from './farm-connection';
import { FarmReplica, type EnqueueResult, type SyncReport } from './farm-replica';
import type { FarmRules } from './farm-rules';
import type { RtTokens } from './rt-tokens';
import type { KeepAlive, OpenSocket } from './socket';
import { createSyncStore, type StoredEvent, type StoredRejection } from './sync-store';

/** The link of a farm never opened: one object, so hooks reading it see no change. */
const STOPPED: FarmLink = { status: 'stopped' };

/** React Native's `AppState`, narrowed to what the client needs. */
export interface AppStateSource {
  readonly currentState: string | null | undefined;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

export interface DataClientDeps<View> {
  readonly db: SqlDatabase;
  readonly rules: FarmRules<View>;
  readonly api: ApiClient;
  readonly tokens: RtTokens;
  /** The API base as a socket URL, such as `wss://dev.kithfield.com/api`. */
  readonly socketBase: string;
  readonly openSocket: OpenSocket;
  /** The signed-in person; writes need one. */
  readonly me: () => PersonId | null;
  readonly appState: AppStateSource;
  readonly newOpId: () => OpId;
  readonly now?: () => number;
  readonly report?: (report: SyncReport) => void;
  readonly tuning?: {
    readonly backoff?: BackoffOptions;
    readonly keepAlive?: KeepAlive;
    readonly httpFallbackAfter?: number;
    readonly random?: () => number;
  };
}

/**
 * Everything the features read and write, over one SQLite store: each farm's replica, the one
 * open farm's socket, the cottage socket, and the writes the farm refused. A phone holds at most
 * two sockets: the cottage's and the open farm's. Sockets close in the background and come back
 * in the foreground.
 */
export async function createDataClient<View>(deps: DataClientDeps<View>) {
  const store = createSyncStore(deps.db);
  const now = deps.now ?? Date.now;
  const report = deps.report ?? (() => undefined);
  const replicas = new Map<FarmId, Promise<FarmReplica<View>>>();
  const links = new Map<FarmId, FarmLink>();
  const listeners = new Set<() => void>();
  let rejections: readonly StoredRejection[] = await store.rejections();
  let open: FarmConnection | null = null;
  let active = deps.appState.currentState === 'active';

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const onRejected = (rejection: StoredRejection) => {
    rejections = [...rejections, rejection];
    notify();
  };

  function replica(farm: FarmId): Promise<FarmReplica<View>> {
    let found = replicas.get(farm);
    if (!found) {
      found = FarmReplica.open({
        farm,
        store,
        rules: deps.rules,
        newOpId: deps.newOpId,
        now,
        report,
        onRejected,
      });
      replicas.set(farm, found);
      found.catch(() => replicas.delete(farm));
    }
    return found;
  }

  function connect(farm: FarmId, r: FarmReplica<View>): FarmConnection {
    return createFarmConnection({
      replica: r,
      url: `${deps.socketBase}/v1/farms/${encodeURIComponent(farm)}/socket`,
      openSocket: deps.openSocket,
      tokens: deps.tokens,
      api: deps.api,
      rulesVersion: deps.rules.RULES_VERSION,
      here: () => active,
      onLink: (link) => {
        links.set(farm, link);
        notify();
      },
      ...deps.tuning,
    });
  }

  /** Sends a farm's outbox over HTTP, for a farm without an open socket. */
  async function drain(farm: FarmId): Promise<void> {
    if (open?.farm === farm) return;
    const connection = connect(farm, await replica(farm));
    try {
      await connection.drainOverHttp();
    } finally {
      connection.stop();
    }
  }

  const holds: { farm: FarmId }[] = [];

  /** Opens the socket of the farm held last, closing the one open before. */
  async function focus(): Promise<void> {
    const farm = holds.at(-1)?.farm ?? null;
    if (open?.farm === farm) return;
    open?.stop();
    open = null;
    if (farm === null) return;
    const r = await replica(farm);
    if ((holds.at(-1)?.farm ?? null) !== farm || open !== null) return;
    const connection = connect(farm, r);
    open = connection;
    connection.start();
    if (!active) connection.pause();
  }

  const cottage: CottageConnection = await createCottageConnection({
    url: () => `${deps.socketBase}/v1/cottage/${encodeURIComponent(deps.me() ?? '')}/socket`,
    openSocket: deps.openSocket,
    tokens: deps.tokens,
    store,
    ...deps.tuning,
  });

  const subscription = deps.appState.addEventListener('change', (state) => {
    if (state === 'active' && !active) {
      active = true;
      cottage.resume();
      open?.resume();
    } else if (state === 'background' && active) {
      active = false;
      open?.pause();
      cottage.pause();
    }
  });

  return {
    store,
    cottage,

    /** One farm's replica, read from SQLite on first use. */
    replica,

    /**
     * Keeps a farm's socket open until the returned release is called. Screens hold the farm they
     * show; the most recent hold wins, and releasing it reopens the one held before.
     */
    hold(farm: FarmId): () => void {
      const token = { farm };
      holds.push(token);
      void focus();
      return () => {
        const at = holds.indexOf(token);
        if (at >= 0) holds.splice(at, 1);
        void focus();
      };
    },

    /** Says whether this person is writing on a farm; only while its socket is open. */
    typing(farm: FarmId, on: boolean): void {
      if (open?.farm === farm) open.typing(on);
    },

    /** How a farm's link stands; farms never opened are `stopped`. */
    link(farm: FarmId): FarmLink {
      return links.get(farm) ?? STOPPED;
    },

    /**
     * Makes a write: checked against the shared rules, queued in the outbox, drawn at once, then
     * sent on the farm's socket (or over HTTP when that farm isn't open).
     */
    async send(farm: FarmId, kind: string, payload: unknown): Promise<EnqueueResult> {
      const me = deps.me();
      if (me === null) throw new Error('Writing needs a session');
      const result = await (await replica(farm)).enqueue(me, { kind, payload });
      if (result.status === 'queued' && open?.farm !== farm)
        void drain(farm).catch(() => undefined);
      return result;
    },

    /** Cached events before `before` (or the newest), oldest first. */
    events(farm: FarmId, options: { before?: number; limit: number }): Promise<StoredEvent[]> {
      return store.events(farm, options);
    },

    /** Pages older history in from the server, into the cache. Answers whether there is more. */
    async pageHistory(farm: FarmId, before: number, limit = 50): Promise<boolean> {
      const page = await deps.api.events(farm, { before, limit });
      await (await replica(farm)).cacheHistory(page.events);
      return page.more;
    },

    /** Writes the farm refused, oldest first, until the UI has explained them. */
    rejections: (): readonly StoredRejection[] => rejections,

    async dismissRejection(opId: OpId): Promise<void> {
      await store.transaction(() => store.dismissRejection(opId));
      rejections = rejections.filter((r) => r.opId !== opId);
      notify();
    },

    /** Called on any change to links or rejections. */
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Starts the cottage and sends writes left over from earlier runs. */
    async start(): Promise<void> {
      cottage.start();
      if (!active) cottage.pause();
      for (const farm of await store.outboxFarms()) void drain(farm).catch(() => undefined);
    },

    stop(): void {
      subscription.remove();
      open?.stop();
      open = null;
      cottage.stop();
    },
  };
}

export type DataClient<View = unknown> = Awaited<ReturnType<typeof createDataClient<View>>>;
