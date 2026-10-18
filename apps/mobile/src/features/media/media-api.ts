import type {
  AbortUploadRequest,
  CompleteUploadRequest,
  CompleteUploadResponse,
  ReadUrlsResponse,
  UploadUrlRequest,
  UploadUrlResponse,
} from '@kithfield/contracts';

import type { ApiClient } from '../../data';

/** The media endpoints (`docs/backend.md` §5); every answer is checked against its contract. */
export interface MediaApi {
  uploadUrl(req: UploadUrlRequest): Promise<UploadUrlResponse>;
  complete(req: CompleteUploadRequest): Promise<CompleteUploadResponse>;
  readUrls(keys: readonly string[]): Promise<ReadUrlsResponse>;
  /** Gives up on an upload nothing points at yet: R2 drops its parts or its object. */
  abort(req: AbortUploadRequest): Promise<null>;
}

/**
 * The media endpoints through the data layer's API client, found as each call is made: the queue
 * can be built (and cleared) before the data layer has started, and a call then fails.
 */
export function mediaApiOf(api: () => ApiClient | null): MediaApi {
  const started = (): Promise<ApiClient> => {
    const current = api();
    return current === null
      ? Promise.reject(new Error('the data layer has not started'))
      : Promise.resolve(current);
  };
  return {
    uploadUrl: (req) => started().then((a) => a.uploadUrl(req)),
    complete: (req) => started().then((a) => a.complete(req)),
    readUrls: (keys) => started().then((a) => a.readUrls({ keys: [...keys] })),
    abort: (req) => started().then((a) => a.abortUpload(req)),
  };
}
