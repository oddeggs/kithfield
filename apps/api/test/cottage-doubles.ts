import type { MeSettingsUpdate, PushJob } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';

import { useCottageAdapters } from '../src/cottage/adapters';
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
    verifyRtToken: (_env, token) => {
      const match = /^test-rt-token:([^:]+)(?::(.+))?$/.exec(token);
      return Promise.resolve(match ? { person: match[1]!, farm: match[2] ?? null } : null);
    },
    sessionPerson: (request) => {
      const match = /^Bearer test-session:(.+)$/.exec(request.headers.get('Authorization') ?? '');
      return Promise.resolve(match?.[1] ?? null);
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

/** Quiet hours that never start (an empty window). */
export const NEVER_QUIET: MeSettingsUpdate = {
  quietHours: { from: '00:00', to: '00:00', timeZone: 'UTC' },
};

/** Quiet hours around now, in UTC, ending in an hour or so. */
export function quietNow(): MeSettingsUpdate {
  const hhmm = (at: number) => new Date(at).toISOString().slice(11, 16);
  const now = Date.now();
  return {
    quietHours: { from: hhmm(now - 3_600_000), to: hhmm(now + 3_600_000), timeZone: 'UTC' },
  };
}

/** A cottage with a farm on its chat list and quiet hours that never start. */
export async function cottageWithFarm(person: string, farm: string, name = 'The Thursday Lot') {
  const cottage = cottageOf(env, person);
  await cottage.updateSettings(NEVER_QUIET);
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
