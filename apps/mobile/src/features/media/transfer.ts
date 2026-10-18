import type { FarmId } from '@kithfield/contracts';

import { ApiError, isTransient } from '../../data/api-client';
import type { MediaApi } from './media-api';
import type { Transport } from './transport';
import {
  isFresh,
  partRange,
  partsSentBytes,
  retryDelayMs,
  type FailureReason,
  type UploadItem,
  type UploadTarget,
} from './upload-model';

/*
 * One run of one item: get a target if it has none (or it is about to expire), PUT the file or
 * each missing part, finish a multipart upload, and answer the item as it stands after the run:
 * done, failed for good, or waiting to try again. Every step that the server keeps (a target, a
 * part's ETag) is handed to `save` as it happens, so a run cut short by a closed app resumes where
 * it stopped.
 */

export interface TransferDeps {
  readonly api: Pick<MediaApi, 'uploadUrl' | 'complete'>;
  readonly transport: Transport;
  readonly now: () => number;
}

export interface TransferHooks {
  /** The item changed in a way worth keeping across a restart. */
  readonly save: (item: UploadItem) => void;
  /** Bytes up so far for the whole item. */
  readonly progress: (sentBytes: number) => void;
  readonly signal: AbortSignal;
}

/** After this many refused PUTs in a row, the item stops instead of asking again. */
const MAX_REFUSALS = 4;

const failed = (item: UploadItem, failure: FailureReason): UploadItem => ({
  ...item,
  phase: 'failed',
  failure,
});

const later = (item: UploadItem, now: number): UploadItem => ({
  ...item,
  phase: 'waiting',
  attempts: item.attempts + 1,
  retryAt: now + retryDelayMs(item.attempts + 1),
});

/** A PUT or a complete the server turned down: start over with a new target, a few times. */
const refused = (item: UploadItem, now: number): UploadItem =>
  item.refusals + 1 >= MAX_REFUSALS
    ? failed(item, 'other')
    : { ...later(item, now), target: null, sentBytes: 0, refusals: item.refusals + 1 };

const failureOf = (error: ApiError): FailureReason =>
  error.status === 413 ? 'too_large' : error.status === 404 ? 'not_member' : 'other';

class Refused extends Error {}

export async function transferItem(
  farm: FarmId,
  start: UploadItem,
  deps: TransferDeps,
  hooks: TransferHooks,
): Promise<UploadItem> {
  const { api, transport, now } = deps;
  let item: UploadItem = { ...start, phase: 'uploading' };
  try {
    if (transport.size(item.uri) !== item.bytes) return failed(item, 'unreadable');
    if (!isFresh(item.target, now())) {
      const answer = await api.uploadUrl({
        farm,
        kind: item.kind,
        bytes: item.bytes,
        mime: item.mime,
      });
      const target: UploadTarget =
        answer.upload === 'multipart' ? { ...answer, etags: {} } : answer;
      item = { ...item, target, sentBytes: 0 };
      hooks.save(item);
    }
    let target = item.target;
    if (target === null) throw new Error('no target');

    if (target.upload === 'single') {
      // The URL is signed for exactly these headers: create only, never overwrite.
      const sent = await transport.put(target.url, item.uri, {
        headers: { 'content-type': item.mime, 'if-none-match': '*' },
        onProgress: hooks.progress,
        signal: hooks.signal,
      });
      // Already there: an earlier try landed and only its answer was lost.
      if (sent.status === 412) {
        return { ...item, phase: 'done', key: target.key, sentBytes: item.bytes, failure: null };
      }
      if (sent.status >= 400 && sent.status < 500) throw new Refused();
      if (sent.status !== 200) throw new Error(`PUT answered ${sent.status}`);
      return { ...item, phase: 'done', key: target.key, sentBytes: item.bytes, failure: null };
    }

    for (const { part, url } of target.parts) {
      if (target.etags[part] !== undefined) continue;
      const before = partsSentBytes(target, item.bytes);
      const { offset, length } = partRange(item.bytes, target.partBytes, part);
      const slice = await transport.slice(item.uri, offset, length);
      let sent;
      try {
        sent = await transport.put(url, slice, {
          headers: {},
          onProgress: (bytes) => hooks.progress(before + bytes),
          signal: hooks.signal,
        });
      } finally {
        transport.remove(slice);
      }
      if (sent.status >= 400 && sent.status < 500) throw new Refused();
      if (sent.status !== 200 || sent.etag === null)
        throw new Error(`part answered ${sent.status}`);
      target = { ...target, etags: { ...target.etags, [part]: sent.etag } };
      item = { ...item, target, sentBytes: partsSentBytes(target, item.bytes), refusals: 0 };
      hooks.save(item);
    }
    const { etags } = target;
    await api
      .complete({
        key: target.key,
        uploadId: target.uploadId,
        parts: target.parts.map(({ part }) => ({ part, etag: etags[part] ?? '' })),
      })
      .catch((error: unknown) => {
        // A part R2 doesn't have, or an upload it no longer knows: send it all again.
        if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
          throw new Refused();
        }
        throw error;
      });
    return { ...item, phase: 'done', key: target.key, sentBytes: item.bytes, failure: null };
  } catch (error) {
    if (hooks.signal.aborted) return { ...item, phase: 'waiting' };
    if (error instanceof Refused) return refused(item, now());
    // Signed out: nothing more goes up for this person; the item waits to be tried again by hand.
    if (error instanceof ApiError && error.status === 401) return failed(item, 'signed_out');
    if (error instanceof ApiError && !isTransient(error)) return failed(item, failureOf(error));
    return later(item, now());
  }
}
