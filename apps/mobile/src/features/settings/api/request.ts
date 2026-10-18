import { ErrorBody } from '@kithfield/contracts';
import type { z } from 'zod';

import { ApiError, REQUEST_TIMEOUT_MS } from '../../../data/api-client';

export { ApiError };

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestDeps {
  /** Such as `https://dev.kithfield.com/api`. */
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  /** The session's bearer header. */
  readonly authHeaders: () => Promise<Record<string, string>>;
  /** Told when the server no longer knows the session (401), so the app can offer sign-in. */
  readonly onUnauthorized?: () => void;
  readonly timeoutMs?: number;
}

const parseJson = (text: string): unknown => {
  try {
    return text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
};

/**
 * One signed-in request, checked against its contract. With `schema` null the answer's body is
 * not read (a 204, or an answer the screen doesn't need).
 */
export type Request = <S extends z.ZodType | null>(
  schema: S,
  method: Method,
  path: string,
  body?: unknown,
) => Promise<S extends z.ZodType ? z.infer<S> : void>;

export function createRequest(deps: RequestDeps): Request {
  return (async (schema: z.ZodType | null, method: Method, path: string, body?: unknown) => {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(await deps.authHeaders()),
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const response = await deps.fetch(`${deps.baseUrl}${path}`, {
        method,
        headers,
        credentials: 'omit',
        signal: abort.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = parseJson(await response.text());
      if (!response.ok) {
        if (response.status === 401) deps.onUnauthorized?.();
        const error = ErrorBody.safeParse(data);
        throw new ApiError(response.status, error.success ? error.data.error.code : 'unknown');
      }
      if (schema === null) return undefined;
      const parsed = schema.safeParse(data);
      // A success that isn't what the contract says (a proxy's page, a newer shape) is a failure.
      if (!parsed.success) throw new ApiError(response.status, 'unknown');
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }) as Request;
}

/** A path segment, escaped. */
export const seg = (id: string) => encodeURIComponent(id);
