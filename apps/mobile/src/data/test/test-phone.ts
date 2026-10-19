import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { FarmId } from '@kithfield/contracts';

import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import type { SqlDatabase, SqlValue } from '../../db/sql';
import { createApiClient } from '../api-client';
import {
  createDataClient,
  type AppStateSource,
  type DataClient,
  type HeldElsewhere,
} from '../data-client';
import type { SyncReport } from '../farm-replica';
import { createOpIdMaker } from '../op-id';
import { createRtTokens } from '../rt-tokens';
import { sessionRecheck } from '../session-check';
import type { FarmTestServer } from './farm-test-server';
import type { FarmView } from '@kithfield/farm';
import { kithfieldRules } from '../farm-rules';

/*
 * A phone for the sync tests: a real SQLite file (Node's own module), the real data client, and
 * the test server as its network. `restart` closes everything and opens the same file again, as
 * when the app is killed and relaunched.
 */

// Jest's module loader does not know `node:sqlite`, so it is taken from the process instead.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

export interface FileDb extends SqlDatabase {
  close(): void;
}

export function openFileDb(path: string): FileDb {
  const sqlite = new DatabaseSync(path);
  return {
    execAsync: (source) => Promise.resolve(void sqlite.exec(source)),
    getAllAsync: <T>(source: string, params: SqlValue[]) =>
      Promise.resolve(sqlite.prepare(source).all(...params) as T[]),
    runAsync: (source, params) => Promise.resolve(sqlite.prepare(source).run(...params)),
    // As expo-sqlite does it: a BEGIN that fails (another transaction is open on the connection)
    // still runs ROLLBACK, which ends that other transaction.
    withTransactionAsync: async (task) => {
      try {
        await Promise.resolve();
        sqlite.exec('BEGIN');
        await task();
        await Promise.resolve();
        sqlite.exec('COMMIT');
      } catch (error) {
        try {
          sqlite.exec('ROLLBACK');
        } catch {
          // Already rolled back.
        }
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
}

/** React Native's AppState, driven by the test. */
export function testAppState(initial = 'active') {
  const listeners = new Set<(state: string) => void>();
  const source = {
    currentState: initial,
    addEventListener(_type: 'change', listener: (state: string) => void) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    set(state: string) {
      source.currentState = state;
      for (const listener of listeners) listener(state);
    },
  };
  return source satisfies AppStateSource;
}

const random = (count: number) =>
  Uint8Array.from({ length: count }, () => Math.floor(Math.random() * 256));

export const FAST = {
  backoff: { baseMs: 5, maxMs: 40 },
  keepAlive: { intervalMs: 60_000, timeoutMs: 60_000 },
  httpFallbackAfter: 2,
};

export class TestPhone {
  client!: DataClient<FarmView>;
  db!: FileDb;
  readonly appState = testAppState();
  readonly reports: SyncReport[] = [];
  /** How many times a 401 had the session re-checked. */
  rechecks = 0;
  /** Calls whose path contains one of these answer 401 once, as a stale token would. */
  readonly staleFor: string[] = [];
  /** Every HTTP call the phone made, as `METHOD path`. */
  readonly calls: string[] = [];
  readonly path: string;

  private constructor(
    readonly server: FarmTestServer,
    /** Who the phone signs in as; a test may change it, as a merge does. */
    public person: string,
    readonly tuning: typeof FAST,
  ) {
    this.path = join(mkdtempSync(join(tmpdir(), 'kithfield-sync-')), 'phone.db');
  }

  /** What the phone keeps outside the data layer (the media queue), when the test gives one. */
  heldElsewhere: HeldElsewhere | undefined;

  static async start(
    server: FarmTestServer,
    person: string,
    tuning = FAST,
    heldElsewhere?: HeldElsewhere,
  ): Promise<TestPhone> {
    const phone = new TestPhone(server, person, tuning);
    phone.heldElsewhere = heldElsewhere;
    await phone.boot();
    return phone;
  }

  private async boot(): Promise<void> {
    this.db = openFileDb(this.path);
    await runMigrations(this.db, MIGRATIONS);
    const api = createApiClient({
      baseUrl: 'https://test.kithfield.invalid/api',
      fetch: (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        this.calls.push(`${init?.method ?? 'GET'} ${url.replace(/^.*\/api/, '')}`);
        const stale = this.staleFor.findIndex((path) => url.includes(path));
        if (stale >= 0) {
          this.staleFor.splice(stale, 1);
          const body = JSON.stringify({ error: { code: 'unauthorized' } });
          return Promise.resolve(new Response(body, { status: 401 }));
        }
        return this.server.fetch(input, init);
      },
      authHeaders: () => Promise.resolve({ authorization: `Bearer ${this.person}` }),
      // The session's re-check, as the phone's refresh asks the server: still known, or ended.
      onUnauthorized: sessionRecheck(async () => {
        this.rechecks += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (this.server.people.has(this.person)) return true;
        this.client.endSession();
        return false;
      }),
    });
    this.client = await createDataClient({
      db: this.db,
      rules: kithfieldRules,
      api,
      tokens: createRtTokens((farm) => api.rtToken(farm), this.server.now),
      socketBase: 'wss://test.kithfield.invalid/api',
      openSocket: this.server.openSocket,
      me: () => this.person,
      appState: this.appState,
      newOpId: createOpIdMaker(random),
      now: this.server.now,
      report: (report) => this.reports.push(report),
      tuning: this.tuning,
      ...(this.heldElsewhere ? { heldElsewhere: this.heldElsewhere } : {}),
    });
    await this.client.start();
  }

  /** The app is killed: sockets go, the database closes. Then it launches again on the same file. */
  async restart(): Promise<void> {
    this.client.stop();
    this.db.close();
    await this.boot();
  }

  stop(): void {
    this.client.stop();
    this.db.close();
    rmSync(dirname(this.path), { recursive: true, force: true });
  }

  async state(farm: FarmId) {
    return (await this.client.replica(farm)).getState();
  }
}

/** Waits until `check` holds, or fails after `ms`. */
export async function until(check: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
