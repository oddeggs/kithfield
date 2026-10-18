import {
  FarmServerFrame,
  LIMITS,
  PROTOCOL_VERSION,
  type FarmId,
  type RejectReason,
  type SocketErrorCode,
} from '@kithfield/contracts';
import { z } from 'zod';

import { ApiError, type ApiClient } from './api-client';
import { failure, type SyncReport } from './apply-events';
import { SOCKET_BACKOFF, type BackoffOptions } from './backoff';
import type { FarmReplica, FrameOutcome, ReceivedFrame } from './farm-replica';
import { drainOverHttp, type DrainOutcome } from './http-drain';
import type { RtTokens } from './rt-tokens';
import {
  KEEP_ALIVE,
  createReconnectingSocket,
  type KeepAlive,
  type OpenSocket,
  type SocketPhase,
} from './socket';

/** Socket errors after which reconnecting can't help. */
export type BlockedCode = Exclude<SocketErrorCode, 'unauthorized'>;

/** How a farm's link to the server stands, for the UI. */
export type FarmLink =
  | { readonly status: 'connecting' | 'catching_up' | 'live' | 'paused' | 'stopped' }
  | { readonly status: 'offline'; readonly attempt: number }
  /** `rules_outdated` and `protocol_unsupported` mean the app needs an update. */
  | { readonly status: 'blocked'; readonly code: BlockedCode };

/** Codes that end the farm for this person: its unsent writes become rejections. */
const ENDS_FARM: Partial<Record<BlockedCode, RejectReason>> = {
  not_member: 'not_member',
  farm_gone: 'not_found',
  banned: 'not_allowed',
};

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
  /** The session is gone (401): the app offers sign-in. */
  readonly onSessionEnded: () => void;
  /** The person is banned: every socket stops. */
  readonly onBanned: () => void;
  readonly report: (report: SyncReport) => void;
  readonly backoff?: BackoffOptions;
  readonly keepAlive?: KeepAlive;
  /** After this many failed connections in a row the outbox goes out over HTTP. */
  readonly httpFallbackAfter?: number;
  readonly random?: () => number;
}

/** Event frames are read loosely: each event is sorted on its own, so one broken one never loses the batch. */
const LooseEvents = z.object({
  type: z.literal('events'),
  events: z.array(z.unknown()).max(LIMITS.eventsBatch),
  more: z.boolean(),
});
const LooseEvent = z.object({ type: z.literal('event'), event: z.unknown() });
const KNOWN = new Set<string>(['snapshot', 'ack', 'rejected', 'presence', 'typing', 'error']);

/**
 * The farm socket: `hello` with the phone's `lastSeq`, then the snapshot and catch-up batches,
 * then live events. Once caught up the outbox goes out as `cmd` frames, in order, and again on
 * every new connection until each write is answered. When the socket can't connect, the outbox
 * goes out over HTTP (`http-drain`).
 */
export function createFarmConnection(deps: FarmConnectionDeps) {
  const { replica, api, tokens, report } = deps;
  const farm: FarmId = replica.farm;
  let link: FarmLink = { status: 'stopped' };
  let sent = new Set<string>();
  let draining = false;
  /** A resync already reconnected since the last good catch-up: the next one waits its turn. */
  let resyncing = false;

  /** Background work never throws into nowhere: a failure is reported. */
  const guard = (where: string, work: Promise<unknown>) => {
    work.catch((error: unknown) => report(failure(where, error)));
  };

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
    onHelloError: (error) => {
      if (!(error instanceof ApiError)) return 'retry';
      if (error.status === 401) {
        deps.onSessionEnded();
        return 'stop';
      }
      if (error.status === 403) {
        guard('farm.block', block(error.code === 'banned' ? 'banned' : 'not_member'));
        return 'stop';
      }
      if (error.status === 404) {
        guard('farm.block', block('farm_gone'));
        return 'stop';
      }
      return 'retry';
    },
    onText: (text, connection) => guard('farm.receive', receive(text, connection)),
    onPhase: (phase: SocketPhase) => {
      if (link.status === 'blocked') return;
      if (phase === 'connecting') setLink({ status: 'connecting' });
      else if (phase === 'open') setLink({ status: 'catching_up' });
      else if (phase === 'paused' || phase === 'stopped') setLink({ status: phase });
      if (phase !== 'open') replica.presence.clear();
    },
    onRetry: (attempt) => {
      if (link.status === 'blocked') return;
      setLink({ status: 'offline', attempt });
      if (attempt >= (deps.httpFallbackAfter ?? 2) && replica.unsent().length > 0) {
        guard('farm.drain', drain());
      }
    },
  });

  async function block(code: BlockedCode): Promise<void> {
    if (link.status === 'blocked' && link.code === code) return;
    setLink({ status: 'blocked', code });
    socket.stop();
    if (code === 'banned') deps.onBanned();
    const reason = ENDS_FARM[code];
    if (reason) await replica.rejectAll(reason);
  }

  function badFrame(frame: string, issues: readonly (readonly (string | number)[])[]) {
    report({ type: 'bad_frame', socket: 'farm', frame, issues });
    socket.drop();
  }

  async function receive(text: string, connection: number): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return badFrame('not_json', []);
    }
    const type = (data as { type?: unknown } | null)?.type;
    let frame: ReceivedFrame;
    if (type === 'events' || type === 'event') {
      const loose = (type === 'events' ? LooseEvents : LooseEvent).safeParse(data);
      if (!loose.success)
        return badFrame(
          type,
          loose.error.issues.map((i) => i.path.map(String)),
        );
      frame = loose.data;
    } else {
      const parsed = FarmServerFrame.safeParse(data);
      if (!parsed.success) {
        // A frame type this app knows that fails its schema; a type it doesn't know is ignored.
        if (typeof type === 'string' && KNOWN.has(type)) {
          return badFrame(
            type,
            parsed.error.issues.map((i) => i.path.map(String)),
          );
        }
        return;
      }
      frame = parsed.data;
    }
    if (frame.type === 'error') {
      if (frame.code === 'unauthorized') tokens.invalidate(farm);
      else await block(frame.code);
      return;
    }
    const outcome = await replica.handle(frame);
    // A frame from a connection already replaced must not mark the new one live.
    if (connection === socket.connection) follow(outcome);
  }

  function follow(outcome: FrameOutcome): void {
    if (outcome.rulesOutdated) return guard('farm.block', block('rules_outdated'));
    if (outcome.resync) {
      // The first resync reconnects at once; another before a good catch-up waits its turn.
      if (resyncing) return socket.drop();
      resyncing = true;
      return socket.reconnect();
    }
    if (outcome.jumped) guard('farm.page_in', pageIn(api.events(farm, { limit: 50 }), false));
    for (const seq of outcome.restored ?? []) {
      guard('farm.restore', pageIn(api.events(farm, { after: seq - 1, limit: 1 }), true));
    }
    if (outcome.caughtUp && link.status !== 'blocked') {
      resyncing = false;
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
    if (fresh.length > 0) guard('farm.count', replica.countAttempts(fresh.map((e) => e.opId)));
  }

  /** Pages events into the cache: the newest after a snapshot jump, or a restored one. */
  async function pageIn(page: ReturnType<ApiClient['events']>, restored: boolean) {
    await replica.cacheHistory((await page).events, restored);
  }

  async function drain(): Promise<DrainOutcome | null> {
    if (draining || link.status === 'blocked') return null;
    draining = true;
    try {
      const outcome = await drainOverHttp(replica, api);
      if (outcome === 'session_ended') deps.onSessionEnded();
      else if (outcome === 'banned') await block('banned');
      else if (outcome === 'not_member') await block('not_member');
      else if (outcome === 'not_found') await block('farm_gone');
      return outcome;
    } finally {
      draining = false;
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
    /** Stops for good, as for a ban another socket heard about. */
    block: (code: BlockedCode) => guard('farm.block', block(code)),
    /** Whether someone is writing; never stored. */
    typing(on: boolean): void {
      if (link.status === 'live') socket.send(JSON.stringify({ type: 'typing', on }));
    },
    stop(): void {
      unsubscribe();
      socket.stop();
    },
  };
}

export type FarmConnection = ReturnType<typeof createFarmConnection>;
