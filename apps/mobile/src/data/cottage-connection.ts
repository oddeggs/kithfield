import { CottageServerFrame, PROTOCOL_VERSION, type ChatListItem } from '@kithfield/contracts';

import { SOCKET_BACKOFF, type BackoffOptions } from './backoff';
import { ApiError } from './api-client';
import { failure, type SyncReport } from './apply-events';
import type { BlockedCode } from './farm-connection';
import type { RtTokens } from './rt-tokens';
import { KEEP_ALIVE, createReconnectingSocket, type KeepAlive, type OpenSocket } from './socket';
import type { SyncStore } from './sync-store';

export type CottageLink =
  | { readonly status: 'connecting' | 'live' | 'offline' | 'paused' | 'stopped' }
  | { readonly status: 'blocked'; readonly code: BlockedCode };

/** The person's cottage as the UI reads it. A new object on every change. */
export interface CottageState {
  /** The chat list, newest first. */
  readonly chats: readonly ChatListItem[];
  /** A note from the safety team is waiting at `GET /v1/me/safety-notes`. */
  readonly safetyNote: boolean;
  readonly link: CottageLink;
}

export interface CottageConnectionDeps {
  /** `wss://<host>/api/v1/cottage/<person>/socket`, for the person signed in now. */
  readonly url: () => string;
  readonly openSocket: OpenSocket;
  readonly tokens: RtTokens;
  readonly store: SyncStore;
  readonly backoff?: BackoffOptions;
  readonly keepAlive?: KeepAlive;
  readonly random?: () => number;
  /** The session is gone (401 for a token, or `session_ended`): the app offers sign-in. */
  readonly onSessionEnded: () => void;
  /** The person is banned: every socket stops. */
  readonly onBanned: () => void;
  readonly report: (report: SyncReport) => void;
}

const SAFETY_NOTE = 'safety_note';

/**
 * The cottage socket: the chat list (whole after `hello`, then one row at a time) and the safety
 * team's notes. Rows are kept in SQLite, so the list opens instantly and offline.
 */
export async function createCottageConnection(deps: CottageConnectionDeps) {
  const { store, tokens } = deps;
  const listeners = new Set<() => void>();
  let state: CottageState = {
    chats: await store.chats(),
    safetyNote: (await store.meta(SAFETY_NOTE)) === '1',
    link: { status: 'stopped' },
  };

  const update = (change: Partial<CottageState>) => {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  };

  const socket = createReconnectingSocket({
    url: deps.url,
    openSocket: deps.openSocket,
    backoff: deps.backoff ?? SOCKET_BACKOFF,
    keepAlive: deps.keepAlive ?? KEEP_ALIVE,
    ...(deps.random ? { random: deps.random } : {}),
    hello: async () =>
      JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, token: await tokens.get() }),
    onHelloError: (error) => {
      if (!(error instanceof ApiError)) return 'retry';
      if (error.status === 401) {
        deps.onSessionEnded();
        return 'stop';
      }
      if (error.status === 403 && error.code === 'banned') {
        block('banned');
        return 'stop';
      }
      return 'retry';
    },
    onText: (text) => {
      receive(text).catch((error: unknown) => deps.report(failure('cottage.receive', error)));
    },
    onPhase: (phase) => {
      if (state.link.status === 'blocked') return;
      if (phase === 'connecting') update({ link: { status: 'connecting' } });
      else if (phase === 'waiting') update({ link: { status: 'offline' } });
      else if (phase === 'paused' || phase === 'stopped') update({ link: { status: phase } });
    },
  });

  function block(code: BlockedCode) {
    update({ link: { status: 'blocked', code } });
    socket.stop();
    if (code === 'banned') deps.onBanned();
  }

  function badFrame(frame: string, issues: readonly (readonly (string | number)[])[]) {
    deps.report({ type: 'bad_frame', socket: 'cottage', frame, issues });
    socket.drop();
  }

  async function receive(text: string): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return badFrame('not_json', []);
    }
    const parsed = CottageServerFrame.safeParse(data);
    if (!parsed.success) {
      const type = (data as { type?: unknown } | null)?.type;
      return badFrame(
        typeof type === 'string' ? type : 'untyped',
        parsed.error.issues.map((i) => i.path.map(String)),
      );
    }
    const frame = parsed.data;
    switch (frame.type) {
      case 'chats':
        // The whole list after hello; a note still waiting is announced again after it.
        await store.transaction(async () => {
          await store.replaceChats(frame.chats);
          await store.setMeta(SAFETY_NOTE, null);
        });
        socket.healthy();
        update({ chats: await store.chats(), safetyNote: false, link: { status: 'live' } });
        return;
      case 'chat':
        await store.transaction(() => store.putChat(frame.chat));
        update({ chats: await store.chats() });
        return;
      case 'safety_note':
        await store.transaction(() => store.setMeta(SAFETY_NOTE, '1'));
        update({ safetyNote: true });
        return;
      case 'error':
        if (frame.code === 'unauthorized') {
          tokens.invalidate();
        } else if (frame.code === 'session_ended') {
          socket.stop();
          deps.onSessionEnded();
        } else {
          block(frame.code);
        }
        return;
      case 'unknown':
        return;
    }
  }

  return {
    getState: (): CottageState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => socket.start(),
    pause: () => socket.pause(),
    resume: () => socket.resume(),
    stop: () => socket.stop(),
    /** Stops for good, as for a ban another socket heard about. */
    block: (code: BlockedCode) => {
      if (state.link.status !== 'blocked') update({ link: { status: 'blocked', code } });
      socket.stop();
    },
    /** Reconnects now with a fresh token, as a new person after a merge. */
    restart: () => {
      tokens.invalidate();
      if (state.link.status === 'blocked') return;
      socket.stop();
      socket.start();
    },
    /** The note was fetched and shown. */
    async clearSafetyNote(): Promise<void> {
      await store.transaction(() => store.setMeta(SAFETY_NOTE, null));
      update({ safetyNote: false });
    },
  };
}

export type CottageConnection = Awaited<ReturnType<typeof createCottageConnection>>;
