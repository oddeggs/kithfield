import {
  CommandResult,
  ErrorBody,
  LIMITS,
  RtTokenResponse,
  SignInNonceResponse,
  type ErrorCode,
  type FarmId,
} from '@kithfield/contracts';
import { z } from 'zod';

/** An answer from the API that wasn't a usable success. No answer at all is a plain fetch error. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'unknown',
  ) {
    super(`The API answered ${status} ${code}`);
    this.name = 'ApiError';
  }
}

/** Worth trying again later: no network, a timeout, rate limiting or a server failure. */
export const isTransient = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 429 || error.status >= 500;

/** How long one request may take before it counts as failed. */
export const REQUEST_TIMEOUT_MS = 15_000;

export interface ApiClientDeps {
  /** Such as `https://dev.kithfield.com/api`. */
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  /** The session's bearer header. */
  readonly authHeaders: () => Promise<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface EventsRange {
  readonly after?: number;
  readonly before?: number;
  readonly limit?: number;
}

/** A write as the outbox holds it: sent as it was made, whatever this app version thinks of it. */
export interface RawCommand {
  readonly opId: string;
  readonly kind: string;
  readonly payload: unknown;
}

/**
 * A history page with its events unchecked: each is sorted on its own (`parseEvent`), so one
 * broken envelope never loses the page.
 */
const LoosePage = z.object({
  events: z.array(z.unknown()).max(LIMITS.eventsBatch),
  more: z.boolean(),
});

const parseJson = (text: string): unknown => {
  try {
    return text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
};

/** The HTTP endpoints the data layer uses. Every answer is checked against its contract. */
export function createApiClient(deps: ApiClientDeps) {
  async function request<S extends z.ZodType>(
    schema: S,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    signedIn = true,
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(signedIn ? await deps.authHeaders() : {}),
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
        const error = ErrorBody.safeParse(data);
        throw new ApiError(response.status, error.success ? error.data.error.code : 'unknown');
      }
      const parsed = schema.safeParse(data);
      // A success that isn't what the contract says (a proxy's page, a newer shape) is a failure.
      if (!parsed.success) throw new ApiError(response.status, 'unknown');
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** A 5-minute socket token: for a farm's socket, or without a farm for the cottage's. */
    rtToken: (farm?: FarmId) =>
      request(RtTokenResponse, 'POST', '/v1/rt-token', farm === undefined ? {} : { farm }),

    /** The HTTP form of a socket `cmd`, with the same idempotency. */
    command: (farm: FarmId, cmd: RawCommand) =>
      request(CommandResult, 'POST', `/v1/farms/${encodeURIComponent(farm)}/cmd`, {
        opId: cmd.opId,
        kind: cmd.kind,
        payload: cmd.payload,
      }),

    /** A page of the farm's log, oldest first. */
    events: (farm: FarmId, range: EventsRange) => {
      const query = new URLSearchParams();
      if (range.after !== undefined) query.set('after', String(range.after));
      if (range.before !== undefined) query.set('before', String(range.before));
      if (range.limit !== undefined) query.set('limit', String(range.limit));
      const qs = query.toString();
      return request(
        LoosePage,
        'GET',
        `/v1/farms/${encodeURIComponent(farm)}/events${qs ? `?${qs}` : ''}`,
      );
    },

    /** A single-use nonce for an Apple or Google sign-in; needs no session. */
    signInNonce: () => request(SignInNonceResponse, 'POST', '/v1/sign-in-nonce', {}, false),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
