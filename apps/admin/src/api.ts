import type { ErrorCode } from '@kithfield/contracts';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { z } from 'zod';

import type { AdminEnv } from './env';

/*
 * The desk talks to the admin API through the service binding. It never checks the Access token
 * itself: it passes the one Access sent (the header, or the `CF_Authorization` cookie) and the API
 * decides.
 */

export const ACCESS_HEADER = 'Cf-Access-Jwt-Assertion';
const ACCESS_COOKIE = 'CF_Authorization';
const API_ORIGIN = 'https://api.internal';

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: ErrorCode | 'server_error' };

/** The Access token for this request, if any. */
export function accessToken(c: Context<AdminEnv>): string | undefined {
  return c.req.header(ACCESS_HEADER) ?? getCookie(c, ACCESS_COOKIE);
}

/** A request to the API on behalf of the moderator, at `/api/admin/v1<path>`. */
export function forward(
  c: Context<AdminEnv>,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = accessToken(c);
  if (token !== undefined) headers.set(ACCESS_HEADER, token);
  headers.set('accept', 'application/json');
  return c.env.API.fetch(new Request(`${API_ORIGIN}/api/admin/v1${path}`, { ...init, headers }));
}

const codeOf = async (response: Response): Promise<ErrorCode | 'server_error'> => {
  try {
    const body: { error?: { code?: ErrorCode } } = await response.json();
    return body.error?.code ?? 'server_error';
  } catch {
    return 'server_error';
  }
};

/** Reads made while rendering one page, so the sidebar and the page share them. */
const reads = new WeakMap<Request, Map<string, Promise<Response>>>();

const fetchOnce = (c: Context<AdminEnv>, path: string): Promise<Response> => {
  let made = reads.get(c.req.raw);
  if (made === undefined) {
    made = new Map();
    reads.set(c.req.raw, made);
  }
  let pending = made.get(path);
  if (pending === undefined) {
    pending = forward(c, path);
    made.set(path, pending);
  }
  return pending.then((r) => r.clone());
};

/** Reads a JSON answer and checks it against its contract. */
export async function read<S extends z.ZodType>(
  c: Context<AdminEnv>,
  path: string,
  schema: S,
): Promise<ApiResult<z.infer<S>>> {
  const response = await fetchOnce(c, path);
  if (!response.ok) return { ok: false, status: response.status, code: await codeOf(response) };
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    console.error('admin API answer did not fit its contract', { path });
    return { ok: false, status: 502, code: 'server_error' };
  }
  return { ok: true, data: parsed.data };
}

/** Sends a JSON body; reads the answer with `schema` when there is one. */
export async function send<S extends z.ZodType>(
  c: Context<AdminEnv>,
  path: string,
  body: unknown,
  schema?: S,
): Promise<ApiResult<z.infer<S> | null>> {
  const response = await forward(c, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) return { ok: false, status: response.status, code: await codeOf(response) };
  if (schema === undefined || response.status === 204) return { ok: true, data: null };
  const parsed = schema.safeParse(await response.json());
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, status: 502, code: 'server_error' };
}
