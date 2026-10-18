import {
  CommandResult,
  ErrorBody,
  EventsPage,
  RtTokenResponse,
  type ErrorCode,
  type FarmCommand,
  type FarmId,
} from '@kithfield/contracts';
import type { z } from 'zod';

/** An answer from the API that wasn't a success. No answer at all is a plain fetch error. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'unknown',
  ) {
    super(`The API answered ${status} ${code}`);
    this.name = 'ApiError';
  }
}

export interface ApiClientDeps {
  /** Such as `https://dev.kithfield.com/api`. */
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  /** The session's headers: the bearer, or the session cookie. */
  readonly authHeaders: () => Promise<Record<string, string>>;
}

export interface EventsRange {
  readonly after?: number;
  readonly before?: number;
  readonly limit?: number;
}

/** The signed-in HTTP endpoints the sync engine uses. Every answer is checked against its contract. */
export function createApiClient(deps: ApiClientDeps) {
  async function request<S extends z.ZodType>(
    schema: S,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(await deps.authHeaders()),
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await deps.fetch(`${deps.baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const data: unknown = text === '' ? null : JSON.parse(text);
    if (!response.ok) {
      const error = ErrorBody.safeParse(data);
      throw new ApiError(response.status, error.success ? error.data.error.code : 'unknown');
    }
    return schema.parse(data);
  }

  return {
    /** A 5-minute socket token: for a farm's socket, or without a farm for the cottage's. */
    rtToken: (farm?: FarmId) =>
      request(RtTokenResponse, 'POST', '/v1/rt-token', farm === undefined ? {} : { farm }),

    /** The HTTP form of a socket `cmd`, with the same idempotency. */
    command: (farm: FarmId, cmd: FarmCommand) =>
      request(CommandResult, 'POST', `/v1/farms/${encodeURIComponent(farm)}/cmd`, cmd),

    /** A page of the farm's log, oldest first. */
    events: (farm: FarmId, range: EventsRange) => {
      const query = new URLSearchParams();
      if (range.after !== undefined) query.set('after', String(range.after));
      if (range.before !== undefined) query.set('before', String(range.before));
      if (range.limit !== undefined) query.set('limit', String(range.limit));
      const qs = query.toString();
      return request(
        EventsPage,
        'GET',
        `/v1/farms/${encodeURIComponent(farm)}/events${qs ? `?${qs}` : ''}`,
      );
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
