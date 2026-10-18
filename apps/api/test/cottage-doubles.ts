import type { PushJob } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';

import { useCottageAdapters } from '../src/cottage/adapters';
import { cottageClock } from '../src/cottage/clock';
import { cottageOf } from '../src/cottage/stub';
import { type PushQueueMessage, pushQueue } from '../src/push/queue';

/*
 * Test doubles for the cottage's edges: sign-in (built alongside), the push queue's producer and
 * Expo's push service. Nothing else is replaced.
 */

/** A socket token the sign-in double accepts: `test-rt-token:<person>[:<farm>]`. */
export const testRtToken = (person: string, farm?: string) =>
  `test-rt-token:${person}${farm === undefined ? '' : `:${farm}`}`;

/** A session header the sign-in double accepts. */
export const testSession = (person: string) => ({ Authorization: `Bearer test-session:${person}` });

/** Stands in for the auth code until it lands: accepts only the test tokens above. */
export function useTestSignInDouble(onHibernate?: (person: string, on: boolean) => void): void {
  useCottageAdapters({
    verifyRtToken: (_env, token, scope) => {
      const match = /^test-rt-token:([^:]+)(?::(.+))?$/.exec(token);
      return Promise.resolve(
        match && match[2] === undefined && match[1] === scope.cottage ? match[1] : null,
      );
    },
    requireSession: async (c, next) => {
      const match = /^Bearer test-session:(.+)$/.exec(c.req.header('Authorization') ?? '');
      if (match?.[1] === undefined) return c.json({ error: { code: 'unauthorized' } }, 401);
      c.set('person', match[1]);
      await next();
      return undefined;
    },
    fanOutHibernate: (_env, person, on) => {
      onHibernate?.(person, on);
      return Promise.resolve();
    },
  });
}

/** Records what the cottage puts on the push queue instead of sending it to the local queue. */
export function recordPushQueue(): {
  readonly sent: { body: PushQueueMessage; delaySeconds: number | undefined }[];
  jobs: () => PushJob[];
} {
  const sent: { body: PushQueueMessage; delaySeconds: number | undefined }[] = [];
  pushQueue.send = (_env, body, delaySeconds) => {
    sent.push({ body: structuredClone(body), delaySeconds });
    return Promise.resolve();
  };
  return { sent, jobs: () => sent.flatMap((s) => ('person' in s.body ? [s.body] : [])) };
}

export interface ExpoCall {
  readonly url: string;
  readonly body: unknown;
}

/**
 * A fake of Expo's push service at the network boundary: answers each request with `answer`
 * and keeps what was sent.
 */
export function fakeExpoPushService(
  answer: (url: string, body: unknown) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: ExpoCall[] } {
  const calls: ExpoCall[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : 'null');
    calls.push({ url, body });
    return answer(url, body);
  }) as typeof fetch;
  return { fetch: fakeFetch, calls };
}

/** Expo's answer: one ok ticket per message, ids `ticket-<n>`. */
export const okTickets = (_url: string, body: unknown) =>
  Response.json({
    data: (body as unknown[]).map((_m, i) => ({ status: 'ok', id: `ticket-${i}` })),
  });

let counter = 0;
/** A person id no other test uses, so cottages never share state. */
export const freshPerson = (label = 'p') => `${label}-${Date.now().toString(36)}-${counter++}`;

/**
 * Sets the cottage's clock to a moment (say `2026-10-18T12:00:00Z`), from which it runs on in
 * real time, so alarms still ring. With no zone sent, the person's quiet floor is 22:00–08:00 UTC.
 */
export function useTestClock(iso: string): number {
  const offset = Date.parse(iso) - Date.now();
  cottageClock.now = () => Date.now() + offset;
  return cottageClock.now();
}

/** Midday UTC: outside every quiet window the tests use. */
export const MIDDAY = '2026-10-18T12:00:00Z';

/** A cottage with a farm on its chat list. */
export async function cottageWithFarm(person: string, farm: string, name = 'The Thursday Lot') {
  const cottage = cottageOf(env, person);
  await cottage.upsertFarm({ farm, farmKind: 'farm', name, with: null });
  return cottage;
}

/** Ledger rows for a person, oldest first. */
export async function ledgerOf(person: string) {
  const { results } = await env.DB.prepare(
    `SELECT kind, farm_id AS farm, seq, collapse_key AS collapseKey, decision, reason, collapsed,
       device_id AS device, ticket_id AS ticket, receipt
     FROM push_ledger WHERE person_id = ? ORDER BY at, rowid`,
  )
    .bind(person)
    .all<Record<string, unknown>>();
  return results;
}

/**
 * D1's `farms` and `people` rows as the farm and auth code write them, for the cottage's lookup
 * of a farm it wasn't told about. Creates the tables only where their migrations haven't landed.
 */
export async function seedDirectory(rows: {
  farms?: { id: string; kind: 'farm' | 'visit'; name: string | null; pair: string | null }[];
  people?: { id: string; displayName: string | null; critter: unknown }[];
}): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS farms (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT,
        land TEXT NOT NULL, keeper_id TEXT, created_at INTEGER NOT NULL,
        size_cap INTEGER NOT NULL DEFAULT 24, pair TEXT UNIQUE)`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS people (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL, created_at DATE NOT NULL,
        updated_at DATE NOT NULL, display_name TEXT, critter TEXT, deleted_at INTEGER)`,
    ),
  ]);
  for (const farm of rows.farms ?? []) {
    await env.DB.prepare(
      'INSERT INTO farms (id, kind, name, land, created_at, pair) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(farm.id, farm.kind, farm.name, 'meadow', 0, farm.pair)
      .run();
  }
  for (const person of rows.people ?? []) {
    await env.DB.prepare(
      `INSERT INTO people (id, name, email, email_verified, created_at, updated_at, display_name,
        critter) VALUES (?, '', ?, 0, 0, 0, ?, ?)`,
    )
      .bind(
        person.id,
        `${person.id}@test.invalid`,
        person.displayName,
        JSON.stringify(person.critter),
      )
      .run();
  }
}
