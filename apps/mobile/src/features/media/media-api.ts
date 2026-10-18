import {
  CompleteUploadResponse,
  ErrorBody,
  ReadUrlsResponse,
  UploadUrlResponse,
  type CompleteUploadRequest,
  type UploadUrlRequest,
} from '@kithfield/contracts';
import type { z } from 'zod';

import { ApiError, REQUEST_TIMEOUT_MS } from '../../data/api-client';

/** The media endpoints (`docs/backend.md` §5); every answer is checked against its contract. */
export interface MediaApi {
  uploadUrl(req: UploadUrlRequest): Promise<UploadUrlResponse>;
  complete(req: CompleteUploadRequest): Promise<CompleteUploadResponse>;
  readUrls(keys: readonly string[]): Promise<ReadUrlsResponse>;
}

export interface MediaApiDeps {
  /** Such as `https://dev.kithfield.com/api`. */
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  /** The session's bearer header. */
  readonly authHeaders: () => Promise<Record<string, string>>;
  readonly timeoutMs?: number;
}

export function createMediaApi(deps: MediaApiDeps): MediaApi {
  async function post<S extends z.ZodType>(schema: S, path: string, body: unknown) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const response = await deps.fetch(`${deps.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(await deps.authHeaders()),
        },
        credentials: 'omit',
        signal: abort.signal,
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let data: unknown;
      try {
        data = text === '' ? null : JSON.parse(text);
      } catch {
        data = undefined;
      }
      if (!response.ok) {
        const error = ErrorBody.safeParse(data);
        throw new ApiError(response.status, error.success ? error.data.error.code : 'unknown');
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new ApiError(response.status, 'unknown');
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    uploadUrl: (req) => post(UploadUrlResponse, '/v1/media/upload-url', req),
    complete: (req) => post(CompleteUploadResponse, '/v1/media/complete', req),
    readUrls: (keys) => post(ReadUrlsResponse, '/v1/media/read-urls', { keys }),
  };
}
