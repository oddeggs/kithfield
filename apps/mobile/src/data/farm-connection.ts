import {
  FarmCommand,
  FarmServerFrame,
  PROTOCOL_VERSION,
  type FarmId,
  type SocketErrorCode,
} from '@kithfield/contracts';

import type { ApiClient } from './api-client';
import { SOCKET_BACKOFF, type BackoffOptions } from './backoff';
import type { FarmReplica, FrameOutcome } from './farm-replica';
import type { RtTokens } from './rt-tokens';
import {
  KEEP_ALIVE,
  createReconnectingSocket,
  type KeepAlive,
  type OpenSocket,
  type SocketPhase,
} from './socket';

/** Socket errors after which reconnecting can't help; the outbox keeps its writes. */
export type BlockedCode = Exclude<SocketErrorCode, 'unauthorized'>;

/** How a farm's link to the server stands, for the UI. */
export type FarmLink =
  | { readonly status: 'connecting' | 'catching_up' | 'live' | 'paused' | 'stopped' }
  | { readonly status: 'offline'; readonly attempt: number }
  /** `rules_outdated` and `protocol_unsupported` mean the app needs an update. */
  | { readonly status: 'blocked'; readonly code: BlockedCode };

export interface FarmConnectionDeps {
  readonly replica: FarmReplica<unknown>;
  /** The farm socket's URL: `wss://<host>/api/v1/farms/<farm>/socket`. */
  readonly url: string;
  readonly openSocket: OpenSocket;
  readonly tokens: RtTokens;
  readonly api: ApiClient;
  /** The highest farm rules version the app's reducer implements. */
  readonly rulesVersion: number;
  /** Whether the farm is open in front of its person (drives `farm_opened`). */
  readonly here: () => boolean;
  readonly onLink: (link: FarmLink) => void;
  readonly backoff?: BackoffOptions;
  readonly keepAlive?: KeepAlive;
  /** After this many failed connections in a row the outbox goes out over HTTP. */
  readonly httpFallbackAfter?: number;
  readonly random?: () => number;
}

/**
 * The farm socket: `hello` with the phone's `lastSeq`, then the snapshot and catch-up batches,
 * then live events. Once caught up the outbox goes out as `cmd` frames, in order, and again on
 * every new connection until each write is answered. When the socket can't connect, the outbox
 * goes out over `POST /v1/farms/:id/cmd` and the log catches up over HTTP paging.
 */
export function createFarmConnection(deps: FarmConnectionDeps) {
  const { replica, api, tokens } = deps;
  const farm: FarmId = replica.farm;
  let link: FarmLink = { status: 'stopped' };
  let sent = new Set<string>();
  let draining = false;

  const setLink = (next: FarmLink) => {
    link = next;
    deps.onLink(next);
  };

  const socket = createReconnectingSocket({
    url: () => deps.url,
    openSocket: deps.openSocket,
    backoff: deps.backoff ?? SOCKET_BACKOFF,
    keepAlive: deps.keepAlive ?? KEEP_ALIVE,
    ...(deps.random ? { random: deps.random } : {}),
    hello: async () => {
      const token = await tokens.get(farm);
      sent = new Set();
      return JSON.stringify({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        token,
        lastSeq: replica.helloSeq(),
        rulesVersion: deps.rulesVersion,
      });
    },
    onText: (text) => void receive(text),
    onPhase: (phase: SocketPhase) => {
      if (link.status === 'blocked') return;
      if (phase === 'connecting') setLink({ status: 'connecting' });
      else if (phase === 'open') setLink({ status: 'catching_up' });
      else if (phase === 'paused' || phase === 'stopped') setLink({ status: phase });
    },
    onRetry: (attempt) => {
      if (link.status === 'blocked') return;
      setLink({ status: 'offline', attempt });
      if (attempt >= (deps.httpFallbackAfter ?? 2) && replica.unsent().length > 0) {
        void drainOverHttp();
      }
    },
  });

  function block(code: BlockedCode) {
    setLink({ status: 'blocked', code });
    socket.stop();
  }

  async function receive(text: string): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    const parsed = FarmServerFrame.safeParse(data);
    // A frame this app can't read is ignored, like a frame type it doesn't know.
    if (!parsed.success) return;
    const frame = parsed.data;
    if (frame.type === 'error') {
      if (frame.code === 'unauthorized') tokens.invalidate(farm);
      else block(frame.code);
      return;
    }
    const outcome = await replica.handle(frame);
    follow(outcome);
  }

  function follow(outcome: FrameOutcome): void {
    if (outcome.rulesOutdated) return block('rules_outdated');
    if (outcome.resync) return socket.reconnect();
    if (outcome.restored) void pageBack(outcome.restored);
    if (outcome.caughtUp && link.status !== 'blocked') {
      setLink({ status: 'live' });
      socket.healthy();
      if (deps.here()) socket.send(JSON.stringify({ type: 'presence', here: true }));
      flush();
    }
  }

  /** Sends every write not yet sent on this connection, oldest first. */
  function flush(): void {
    if (link.status !== 'live') return;
    const fresh = replica.unsent().filter((e) => !sent.has(e.opId));
    for (const entry of fresh) {
      const frame = { type: 'cmd', opId: entry.opId, kind: entry.kind, payload: entry.payload };
      if (!socket.send(JSON.stringify(frame))) return;
      sent.add(entry.opId);
    }
    if (fresh.length > 0) void replica.countAttempts(fresh.map((e) => e.opId));
  }

  /** Restored events come back in full: page each one in again. */
  async function pageBack(seqs: readonly number[]): Promise<void> {
    for (const seq of seqs) {
      try {
        const page = await api.events(farm, { after: seq - 1, limit: 1 });
        await replica.cacheHistory(page.events);
      } catch {
        // It comes back on the next restore or history page.
      }
    }
  }

  /** The outbox over HTTP, then the log over HTTP, while the socket can't connect. */
  async function drainOverHttp(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      let settled = 0;
      for (const entry of replica.unsent()) {
        const cmd = FarmCommand.parse({
          opId: entry.opId,
          kind: entry.kind,
          payload: entry.payload,
        });
        const result = await api.command(farm, cmd);
        await replica.settle(
          result.opId,
          result.result === 'ack' ? { seq: result.seq } : { reason: result.reason },
        );
        settled += 1;
      }
      if (settled > 0) await catchUpOverHttp();
    } catch {
      // No network, or the API refused: the socket's next failed attempt tries again.
    } finally {
      draining = false;
    }
  }

  async function catchUpOverHttp(): Promise<void> {
    // Without the farm's state only its snapshot helps, and that comes on the socket.
    if (replica.helloSeq() === 0 && replica.getState().lastSeq > 0) return;
    for (;;) {
      const page = await api.events(farm, { after: replica.getState().lastSeq, limit: 200 });
      const outcome = await replica.applyPage(page.events);
      if (!page.more || outcome.resync || outcome.rulesOutdated) return;
    }
  }

  const unsubscribe = replica.subscribe(flush);

  return {
    farm,
    get link(): FarmLink {
      return link;
    },
    start(): void {
      if (link.status === 'blocked') return;
      socket.start();
    },
    /** The app went to the background: say goodbye and close. */
    pause(): void {
      if (link.status === 'live') socket.send(JSON.stringify({ type: 'presence', here: false }));
      socket.pause();
    },
    resume(): void {
      socket.resume();
    },
    /** Whether someone is writing; never stored. */
    typing(on: boolean): void {
      if (link.status === 'live') socket.send(JSON.stringify({ type: 'typing', on }));
    },
    /** Sends the outbox over HTTP now, for a farm without an open socket. */
    drainOverHttp,
    stop(): void {
      unsubscribe();
      socket.stop();
    },
  };
}

export type FarmConnection = ReturnType<typeof createFarmConnection>;
