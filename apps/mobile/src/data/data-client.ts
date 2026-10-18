import { LIMITS, type FarmId, type OpId } from '@kithfield/contracts';

import { failure } from './apply-events';
import type { DataClientDeps, DataStatus } from './client-types';
import { createCottageConnection, type CottageConnection } from './cottage-connection';
import { createFarmConnection, type FarmConnection, type FarmLink } from './farm-connection';
import type { EnqueueResult } from './farm-replica';
import { catchUpOverHttp } from './http-drain';
import { createOutboxDrainer } from './outbox-drainer';
import { createReplicas } from './replicas';
import { createSyncStore, type StoredEvent, type StoredRejection } from './sync-store';

export type { AppStateSource, DataClientDeps, DataStatus, HeldElsewhere } from './client-types';

/**
 * How catching a farm up over HTTP ended: `done`; `open` (its socket is open and keeps it up to
 * date); `needs_socket` (the phone holds nothing of it, owes it a snapshot, or is more than a
 * snapshot gap behind: only the socket sends snapshots).
 */
export type CatchUp = 'done' | 'open' | 'needs_socket';

const seqOf = (raw: unknown): number | null => {
  const seq = (raw as { seq?: unknown } | null)?.seq;
  return typeof seq === 'number' ? seq : null;
};

/** The link of a farm never opened: one object, so hooks reading it see no change. */
const STOPPED: FarmLink = { status: 'stopped' };

/**
 * Everything the features read and write, over one SQLite store: each farm's replica, the one
 * open farm's socket, the cottage socket, the outbox of farms without a socket, and the writes
 * the farm refused. Sockets close in the background and come back in the foreground.
 */
export async function createDataClient<View>(deps: DataClientDeps<View>) {
  const store = createSyncStore(deps.db);
  const now = deps.now ?? Date.now;
  const report = deps.report ?? (() => undefined);
  const guard = (where: string, work: Promise<unknown>) => {
    work.catch((error: unknown) => report(failure(where, error)));
  };
  const links = new Map<FarmId, FarmLink>();
  const listeners = new Set<() => void>();
  const holds: { farm: FarmId }[] = [];
  let rejections: readonly StoredRejection[] = await store.rejections();
  let status: DataStatus = { sessionEnded: false, banned: false };
  let open: FarmConnection | null = null;
  let active = deps.appState.currentState === 'active';
  let stopped = false;

  const notify = () => {
    for (const listener of listeners) listener();
  };
  const setStatus = (change: Partial<DataStatus>) => {
    status = { ...status, ...change };
    notify();
  };

  const replicas = createReplicas({
    store,
    rules: deps.rules,
    newOpId: deps.newOpId,
    now,
    report,
    onRejected: (rejection) => {
      rejections = [...rejections, rejection];
      notify();
    },
  });
  const replica = replicas.get;

  /**
   * Forgets everything this person holds on the phone: socket tokens, the tables, the replicas
   * read from them, and what they keep elsewhere (the media queue).
   */
  async function wipe(): Promise<void> {
    deps.tokens.clear();
    await store.transaction(() => store.wipe());
    replicas.clear();
    links.clear();
    rejections = [];
    await deps.heldElsewhere
      ?.clear()
      .catch((error: unknown) => report(failure('wipe.held_elsewhere', error)));
    notify();
  }

  /**
   * The session is over, as confirmed by a socket's `session_ended`, the session's re-check or
   * the launch check (never by one call's 401): every socket stops, this person's data is wiped
   * as signing out does, and the app offers sign-in. Writes still waiting are counted first, the
   * way signing out reports them.
   */
  const sessionEnded = () => {
    if (status.sessionEnded) return;
    open?.stop();
    cottage.stop();
    setStatus({ sessionEnded: true });
    guard(
      'session_ended.wipe',
      (async () => {
        const unsent =
          (await store.unsentCount()) + ((await deps.heldElsewhere?.pendingCount()) ?? 0);
        if (unsent > 0) report({ type: 'unsent_at_session_end', count: unsent });
        await wipe();
      })(),
    );
  };
  const banned = () => {
    if (status.banned) return;
    setStatus({ banned: true });
    open?.block('banned');
    cottage.block('banned');
  };

  const drainer = createOutboxDrainer({
    store,
    replica,
    api: deps.api,
    isOpen: (farm) => open?.farm === farm,
    // A 401 while draining already had the session re-checked (`onUnauthorized`); the drain
    // stops for now and the writes stay queued.
    onOutcome: (_farm, outcome) => {
      if (outcome === 'banned') banned();
    },
    report,
    ...deps.tuning,
  });

  const cottage: CottageConnection = await createCottageConnection({
    url: () => `${deps.socketBase}/v1/cottage/${encodeURIComponent(deps.me() ?? '')}/socket`,
    openSocket: deps.openSocket,
    tokens: deps.tokens,
    store,
    onSessionEnded: sessionEnded,
    onBanned: banned,
    report,
    ...deps.tuning,
  });

  /** Opens the socket of the farm held last, closing the one open before. */
  async function focus(): Promise<void> {
    const farm = holds.at(-1)?.farm ?? null;
    if (stopped || open?.farm === farm) return;
    open?.stop();
    open = null;
    if (farm === null || status.sessionEnded || status.banned) return;
    const r = await replica(farm);
    if (stopped || (holds.at(-1)?.farm ?? null) !== farm || open !== null) return;
    const connection = createFarmConnection({
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
      onSessionEnded: sessionEnded,
      onBanned: banned,
      report,
      ...deps.tuning,
    });
    open = connection;
    connection.start();
    if (!active) connection.pause();
  }

  /** Stops every socket and the drainer. */
  const halt = () => {
    drainer.stop();
    open?.stop();
    open = null;
    cottage.stop();
  };

  const startCottage = () => {
    if (deps.me() === null || status.sessionEnded || status.banned) return;
    cottage.start();
    if (!active) cottage.pause();
  };

  const subscription = deps.appState.addEventListener('change', (state) => {
    if (state === 'active' && !active) {
      active = true;
      cottage.resume();
      open?.resume();
      guard('outbox.drain', drainer.drainAll());
    } else if (state === 'background' && active) {
      active = false;
      open?.pause();
      cottage.pause();
    }
  });

  return {
    store,
    cottage,
    /** The API's HTTP calls the hooks don't make: the profile, planting and joining farms. */
    api: deps.api,
    rules: deps.rules,
    /** Reports a problem (no content), as the data layer's own failures are. */
    report,

    /** One farm's replica, read from SQLite on first use. */
    replica,

    /**
     * Keeps a farm's socket open until the returned release is called. Screens hold the farm they
     * show; the most recent hold wins, and releasing it reopens the one held before.
     */
    hold(farm: FarmId): () => void {
      const token = { farm };
      holds.push(token);
      guard('focus', focus());
      return () => {
        const at = holds.indexOf(token);
        if (at >= 0) holds.splice(at, 1);
        guard('focus', focus());
      };
    },

    /** Says whether this person is writing on a farm; only while its socket is open. */
    typing(farm: FarmId, on: boolean): void {
      if (open?.farm === farm) open.typing(on);
    },

    /** How a farm's link stands; farms never opened are `stopped`. */
    link: (farm: FarmId): FarmLink => links.get(farm) ?? STOPPED,

    /** Whether the session ended or the person is banned. */
    status: (): DataStatus => status,

    /**
     * Makes a write: checked against the shared rules, queued in the outbox, drawn at once, then
     * sent on the farm's socket (or over HTTP when that farm isn't open). `opId` is for a write
     * that may be made again (the media queue after a crash): one this phone holds isn't queued
     * twice. Without it the write gets a new op id.
     */
    async send(farm: FarmId, kind: string, payload: unknown, opId?: OpId): Promise<EnqueueResult> {
      const me = deps.me();
      if (me === null) throw new Error('Writing needs a session');
      const result = await (await replica(farm)).enqueue(me, { kind, payload, opId });
      if (result.status === 'queued' && open?.farm !== farm)
        guard('outbox.drain', drainer.drainAll());
      return result;
    },

    /**
     * Brings a farm the phone isn't holding open up to date over HTTP paging, for screens that
     * show many farms at once. Network failures throw.
     */
    async catchUp(farm: FarmId): Promise<CatchUp> {
      if (open?.farm === farm) return 'open';
      const r = await replica(farm);
      if (r.helloSeq() === 0) return 'needs_socket';
      const newest = await deps.api.events(farm, { limit: 1 });
      const head = seqOf(newest.events.at(-1)) ?? 0;
      if (head - r.getState().lastSeq > LIMITS.snapshotGap) return 'needs_socket';
      await catchUpOverHttp(r, deps.api);
      return 'done';
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

    /** Called on any change to links, rejections or the status. */
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Starts the cottage (once there is a person) and sends writes left from earlier runs. */
    async start(): Promise<void> {
      startCottage();
      await drainer.drainAll();
    },

    /**
     * Signing in moved this phone to another person (a merge). Sockets reconnect with new tokens
     * as that person; outbox rows stay, and the server accepts them for the person kept.
     */
    personChanged(): void {
      deps.tokens.clear();
      setStatus({ sessionEnded: false });
      cottage.restart();
      open?.stop();
      open = null;
      guard('focus', focus());
    },

    /**
     * The session ended outside the sockets, as the launch check or a re-check confirmed: stop,
     * wipe this person's data and offer sign-in. Once per ended session.
     */
    endSession: () => sessionEnded(),

    /**
     * Before signing out: sends what it can, then (unless writes are still waiting and `force` is
     * false) stops every socket and wipes this person's tables and what they hold elsewhere (the
     * media queue). Answers how many writes would be lost, counting messages still uploading, so
     * the UI can warn first.
     */
    async signOut(options: { force: boolean }): Promise<{ unsent: number; signedOut: boolean }> {
      await drainer.drainAll();
      const unsent =
        (await store.unsentCount()) + ((await deps.heldElsewhere?.pendingCount()) ?? 0);
      if (unsent > 0 && !options.force) return { unsent, signedOut: false };
      if (unsent > 0) report({ type: 'unsent_at_sign_out', count: unsent });
      holds.splice(0);
      halt();
      await wipe();
      return { unsent, signedOut: true };
    },

    stop(): void {
      stopped = true;
      subscription.remove();
      halt();
    },
  };
}

export type DataClient<View = unknown> = Awaited<ReturnType<typeof createDataClient<View>>>;
