import { PING, PONG } from '@kithfield/contracts';

import { backoffDelay, type BackoffOptions } from './backoff';

/** The part of a WebSocket the clients use: React Native's global `WebSocket` on the phone. */
export interface WebSocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type OpenSocket = (url: string) => WebSocketLike;

export interface KeepAlive {
  /** How often the phone says `ping` on an open socket. */
  readonly intervalMs: number;
  /** How long it waits for anything back before it calls the socket dead. */
  readonly timeoutMs: number;
}

export const KEEP_ALIVE: KeepAlive = { intervalMs: 25_000, timeoutMs: 10_000 };

export type SocketPhase = 'connecting' | 'open' | 'waiting' | 'paused' | 'stopped';

export interface ReconnectingSocketOptions {
  /** Read on each connection, so it can name the person signed in now. */
  readonly url: () => string;
  readonly openSocket: OpenSocket;
  readonly backoff: BackoffOptions;
  readonly keepAlive: KeepAlive;
  /** The first frame, made fresh for each connection (it carries a new token). */
  readonly hello: () => Promise<string>;
  /** Every text message except `pong`. */
  readonly onText: (text: string) => void;
  readonly onPhase: (phase: SocketPhase) => void;
  /** After a failed or dropped connection, with how many failures in a row. */
  readonly onRetry?: (attempt: number) => void;
  readonly random?: () => number;
}

/**
 * One socket that keeps itself connected: it says hello first on every connection, retries with
 * back-off and jitter, keeps alive with `ping`/`pong` (plain text, never JSON) and calls a socket
 * dead when nothing comes back in time. `pause` closes it for the background; `resume` reconnects
 * at once.
 */
export function createReconnectingSocket(options: ReconnectingSocketOptions) {
  let socket: WebSocketLike | null = null;
  let phase: SocketPhase = 'stopped';
  let failures = 0;
  // Each connection attempt's number: an attempt overtaken while it fetched its hello gives up.
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const setPhase = (next: SocketPhase) => {
    phase = next;
    options.onPhase(next);
  };

  const clearTimers = () => {
    clearTimeout(retryTimer);
    clearTimeout(pingTimer);
    clearTimeout(deadline);
  };

  /** Lets go of the current socket without hearing from it again. */
  const detach = () => {
    clearTimers();
    const current = socket;
    socket = null;
    if (!current) return;
    current.onopen = current.onmessage = current.onclose = current.onerror = null;
    try {
      current.close();
    } catch {
      // Already closed.
    }
  };

  const scheduleRetry = () => {
    detach();
    if (phase === 'paused' || phase === 'stopped') return;
    failures += 1;
    setPhase('waiting');
    options.onRetry?.(failures);
    retryTimer = setTimeout(
      () => void connect(),
      backoffDelay(failures, options.backoff, options.random),
    );
  };

  const schedulePing = () => {
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => {
      if (!socket || phase !== 'open') return;
      try {
        socket.send(PING);
      } catch {
        return scheduleRetry();
      }
      clearTimeout(deadline);
      deadline = setTimeout(scheduleRetry, options.keepAlive.timeoutMs);
      schedulePing();
    }, options.keepAlive.intervalMs);
  };

  const heard = () => clearTimeout(deadline);

  async function connect(): Promise<void> {
    detach();
    attempt += 1;
    const mine = attempt;
    setPhase('connecting');
    let hello: string;
    try {
      hello = await options.hello();
    } catch {
      if (mine === attempt && phase === 'connecting') scheduleRetry();
      return;
    }
    if (mine !== attempt || phase !== 'connecting') return;

    const next = options.openSocket(options.url());
    socket = next;
    next.onopen = () => {
      if (socket !== next) return;
      next.send(hello);
      setPhase('open');
      schedulePing();
    };
    next.onmessage = (event) => {
      if (socket !== next) return;
      heard();
      if (typeof event.data !== 'string' || event.data === PONG) return;
      options.onText(event.data);
    };
    next.onclose = next.onerror = () => {
      if (socket === next) scheduleRetry();
    };
  }

  return {
    get phase(): SocketPhase {
      return phase;
    },
    start(): void {
      if (phase === 'stopped' || phase === 'paused') void connect();
    },
    /** The connection proved good (caught up): the next failure starts the back-off again. */
    healthy(): void {
      failures = 0;
    },
    /** Sends on the open socket; false when there is none. */
    send(text: string): boolean {
      if (!socket || phase !== 'open') return false;
      try {
        socket.send(text);
        return true;
      } catch {
        // Closing under us: its close event is on the way, or this starts the retry.
        scheduleRetry();
        return false;
      }
    },
    /** Drops this connection and opens a new one now. */
    reconnect(): void {
      if (phase === 'paused' || phase === 'stopped') return;
      void connect();
    },
    /** Drops this connection; the next one waits its turn in the back-off. */
    drop(): void {
      if (phase === 'paused' || phase === 'stopped') return;
      scheduleRetry();
    },
    pause(): void {
      if (phase === 'stopped') return;
      attempt += 1;
      detach();
      setPhase('paused');
    },
    resume(): void {
      if (phase !== 'paused') return;
      failures = 0;
      void connect();
    },
    stop(): void {
      attempt += 1;
      detach();
      setPhase('stopped');
    },
  };
}

export type ReconnectingSocket = ReturnType<typeof createReconnectingSocket>;
