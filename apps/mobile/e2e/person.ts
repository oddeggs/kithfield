import { createHash, getRandomValues } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FarmView } from '@kithfield/farm';

import { runMigrations } from '../src/db/migrate';
import { MIGRATIONS } from '../src/db/migrations';
import { createApiClient, type ApiClient } from '../src/data/api-client';
import { authPort, createKithfieldAuthClient } from '../src/data/auth-client';
import { createDataClient, type DataClient } from '../src/data/data-client';
import { kithfieldRules } from '../src/data/farm-rules';
import { createOpIdMaker } from '../src/data/op-id';
import { createRtTokens } from '../src/data/rt-tokens';
import { createSession, type Session, type SessionStorage } from '../src/data/session';
import { createSignIn, type SignIn } from '../src/data/sign-in';
import type { SyncReport } from '../src/data/apply-events';
import type { WebSocketLike } from '../src/data/socket';
import { openFileDb, testAppState, type FileDb } from '../src/data/test/test-phone';

/*
 * A phone for the end-to-end tests, on Node: the real data client, session and API client over
 * real `fetch` and Node's own `WebSocket`, with its store in a SQLite file. `offline` cuts its
 * network (open sockets close, requests fail) the way losing signal does.
 */

const memoryKeychain = (): SessionStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    getItemAsync: (key) => Promise.resolve(values.get(key) ?? null),
    setItem: (key, value) => void values.set(key, value),
    setItemAsync: (key, value) => Promise.resolve(void values.set(key, value)),
  };
};

export class Phone {
  client!: DataClient<FarmView>;
  db!: FileDb;
  api!: ApiClient;
  offline = false;
  readonly reports: SyncReport[] = [];
  readonly session: Session;
  readonly signIn: SignIn;
  readonly appState = testAppState();
  private readonly sockets = new Set<WebSocket>();
  private readonly path = join(mkdtempSync(join(tmpdir(), 'kithfield-phone-')), 'phone.db');

  constructor(
    readonly name: string,
    readonly base: string,
    /** The Keychain: another phone's, to act as the same person with a fresh store. */
    readonly keychain: SessionStorage = memoryKeychain(),
  ) {
    // Node's fetch sends `sec-fetch-mode`, so Better Auth asks it for an origin the way it asks a
    // browser; the app's own scheme is the one it trusts. The phone's native fetch sends neither.
    const authFetch: typeof fetch = (input, init) =>
      this.fetch(input, {
        ...init,
        headers: { ...Object.fromEntries(new Headers(init?.headers)), origin: 'kithfield-dev://' },
      });
    const auth = createKithfieldAuthClient({
      apiBase: base,
      storage: this.keychain,
      fetch: authFetch,
    });
    const port = authPort(auth);
    this.session = createSession(port, this.keychain);
    this.api = this.makeApi();
    this.signIn = createSignIn({
      auth: port,
      session: this.session,
      fetchNonce: () => this.api.signInNonce(),
      sha256Hex: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
    });
    this.session.onPersonChanged(() => this.client.personChanged());
  }

  get person(): string {
    const person = this.session.person()?.person;
    if (!person) throw new Error(`${this.name} has no person`);
    return person;
  }

  private fetch: typeof fetch = (input, init) =>
    this.offline ? Promise.reject(new TypeError('Network request failed')) : fetch(input, init);

  private makeApi(): ApiClient {
    return createApiClient({
      baseUrl: this.base,
      fetch: this.fetch,
      authHeaders: () => this.session.headers(),
    });
  }

  /** Opens the store and the data client: a launch. */
  async launch(): Promise<void> {
    this.db = openFileDb(this.path);
    await runMigrations(this.db, MIGRATIONS);
    const api = this.makeApi();
    this.client = await createDataClient({
      db: this.db,
      rules: kithfieldRules,
      api,
      tokens: createRtTokens((farm) => api.rtToken(farm)),
      socketBase: this.base.replace(/^http/, 'ws'),
      openSocket: (url) => {
        if (this.offline) return unreachable();
        const socket = new WebSocket(url);
        this.sockets.add(socket);
        socket.addEventListener('close', () => this.sockets.delete(socket));
        return socket as unknown as WebSocketLike;
      },
      me: () => this.session.person()?.person ?? null,
      appState: this.appState,
      newOpId: createOpIdMaker((n) => getRandomValues(new Uint8Array(n))),
      report: (report) => this.reports.push(report),
      tuning: { backoff: { baseMs: 50, maxMs: 400 }, httpFallbackAfter: 2 },
    });
    await this.client.start();
  }

  /** The app is killed: sockets go, the store closes. */
  kill(): void {
    this.client.stop();
    this.db.close();
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
    if (offline) for (const socket of this.sockets) socket.close();
  }

  /** A signed-in request the data client doesn't make (creating farms, joining). */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(await this.session.headers()) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  }
}

/** A socket to a host that can't be reached: it fails on the next tick. */
function unreachable(): WebSocketLike {
  const socket: WebSocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: () => {
      throw new Error('INVALID_STATE_ERR');
    },
    close: () => undefined,
  };
  setTimeout(() => {
    socket.onerror?.({});
    socket.onclose?.({ code: 1006 });
  }, 0);
  return socket;
}
