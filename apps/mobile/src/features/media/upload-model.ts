import {
  LIMITS,
  type FarmId,
  type MediaRef,
  type Seq,
  type UploadUrlRequest,
  type UploadUrlResponse,
} from '@kithfield/contracts';

/*
 * The upload queue's state, as plain data that survives a restart, and the rules over it that
 * don't touch the network or the disk.
 */

export type MediaKind = UploadUrlRequest['kind'];

/** A file on this phone, ready to go up: resized, compressed or recorded already. */
export interface LocalMedia {
  /** In the queue's own folder, so the system can't clear it before it's sent. */
  readonly uri: string;
  readonly kind: MediaKind;
  readonly mime: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  /** A file's name as the sender saw it. */
  readonly name?: string;
}

/** Where an item is going: the API's answer, plus each part's ETag once it is up. */
export type UploadTarget =
  | Extract<UploadUrlResponse, { upload: 'single' }>
  | (Extract<UploadUrlResponse, { upload: 'multipart' }> & {
      readonly etags: Readonly<Record<number, string>>;
    });

/** Why an item stopped for good. */
export type FailureReason = 'too_large' | 'not_member' | 'unreadable' | 'signed_out' | 'other';

export type ItemPhase = 'waiting' | 'uploading' | 'done' | 'failed';

export interface UploadItem extends LocalMedia {
  readonly id: string;
  readonly phase: ItemPhase;
  readonly target: UploadTarget | null;
  /** The object's key once the upload is finished. */
  readonly key: string | null;
  /** Bytes the server has, as far as this phone knows. */
  readonly sentBytes: number;
  readonly attempts: number;
  /** PUTs refused in a row (an expired or rejected URL): after a few, the item stops. */
  readonly refusals: number;
  /** Not before this time (epoch ms), after a failure that may pass. */
  readonly retryAt: number;
  readonly failure: FailureReason | null;
}

/** What the uploaded keys are sent in once every item is up. */
export type BatchMessage =
  | {
      readonly command: 'media';
      readonly caption?: string;
      readonly replyTo?: Seq;
      readonly doodle?: boolean;
    }
  | {
      readonly command: 'voice';
      readonly durationMs: number;
      /** Levels 0–255 for the drawn waveform, at most 64. */
      readonly waveform: readonly number[];
      readonly replyTo?: Seq;
    };

/** `uploading` until every item is up, then `sent` once the message is in the outbox. */
export type BatchPhase = 'uploading' | 'sent' | 'failed';

export interface UploadBatch {
  readonly id: string;
  readonly farm: FarmId;
  readonly message: BatchMessage;
  readonly items: readonly UploadItem[];
  readonly createdAt: number;
  readonly phase: BatchPhase;
  /** The outbox write that carries the keys, once queued. */
  readonly opId: string | null;
  readonly sentAt: number | null;
  /** Retry the send itself, after a failure to queue it. */
  readonly retryAt: number;
  /** When it last stopped for good (an item that can't go, or a send refused); null otherwise. */
  readonly failedAt: number | null;
}

export const newItem = (id: string, media: LocalMedia): UploadItem => ({
  ...media,
  id,
  phase: 'waiting',
  target: null,
  key: null,
  sentBytes: 0,
  attempts: 0,
  refusals: 0,
  retryAt: 0,
  failure: null,
});

/** How far an item is, 0 to 1. */
export const itemProgress = (item: UploadItem): number =>
  item.phase === 'done' ? 1 : Math.min(1, item.bytes > 0 ? item.sentBytes / item.bytes : 0);

/** Items up, of all items still in the batch. */
export const batchCounts = (batch: UploadBatch) => ({
  done: batch.items.filter((i) => i.phase === 'done').length,
  total: batch.items.length,
});

/** Bytes of the parts already up, by their ETags. */
export const partsSentBytes = (target: UploadTarget | null, bytes: number): number => {
  if (target === null || target.upload !== 'multipart') return 0;
  const parts = Object.keys(target.etags).map(Number);
  const last = target.parts.length;
  return parts.reduce(
    (sum, part) => sum + (part === last ? bytes - target.partBytes * (last - 1) : target.partBytes),
    0,
  );
};

/** The byte range of a part (1-based) of an upload of `bytes`. */
export const partRange = (bytes: number, partBytes: number, part: number) => {
  const offset = (part - 1) * partBytes;
  return { offset, length: Math.min(partBytes, bytes - offset) };
};

/** A target is worth using while it has a minute of life left. */
export const isFresh = (target: UploadTarget | null, now: number): boolean =>
  target !== null && target.expiresAt - 60_000 > now;

/** Waits after the 1st, 2nd… failure: 2 s, 5 s, 15 s, 30 s, then a minute, up to 5 minutes. */
export function retryDelayMs(attempts: number): number {
  const steps = [2_000, 5_000, 15_000, 30_000, 60_000];
  return attempts <= steps.length
    ? (steps[Math.max(0, attempts - 1)] ?? 2_000)
    : Math.min(300_000, 60_000 * (attempts - steps.length + 1));
}

/** The reference a farm event carries for an uploaded item. */
export function mediaRefOf(item: UploadItem): MediaRef {
  if (item.key === null) throw new Error('the item is not uploaded');
  return {
    key: item.key,
    mime: item.mime,
    bytes: item.bytes,
    ...(item.width !== undefined ? { width: item.width } : {}),
    ...(item.height !== undefined ? { height: item.height } : {}),
    ...(item.durationMs !== undefined ? { durationMs: Math.max(1, item.durationMs) } : {}),
    ...(item.name !== undefined ? { name: item.name.slice(0, 255) } : {}),
  };
}

/** The farm command that sends a finished batch: `media` for photos, video and files, or `voice`. */
export function commandOf(batch: UploadBatch): { kind: 'media' | 'voice'; payload: unknown } {
  const refs = batch.items.map(mediaRefOf);
  const { message } = batch;
  if (message.command === 'voice') {
    const [audio] = refs;
    if (audio === undefined || refs.length !== 1) throw new Error('a voice note is one item');
    return {
      kind: 'voice',
      payload: {
        audio,
        durationMs: Math.min(LIMITS.voiceMs, Math.max(1, Math.round(message.durationMs))),
        waveform: message.waveform
          .slice(0, LIMITS.waveform)
          .map((level) => Math.min(255, Math.max(0, Math.round(level)))),
        ...(message.replyTo !== undefined ? { replyTo: message.replyTo } : {}),
      },
    };
  }
  return {
    kind: 'media',
    payload: {
      items: refs.slice(0, LIMITS.mediaItems),
      ...(message.caption !== undefined && message.caption.trim() !== ''
        ? { caption: message.caption.slice(0, LIMITS.message) }
        : {}),
      ...(message.doodle === true ? { doodle: true } : {}),
      ...(message.replyTo !== undefined ? { replyTo: message.replyTo } : {}),
    },
  };
}

/** One progress reading: total bytes up across a batch at a moment. */
export interface Sample {
  readonly at: number;
  readonly sent: number;
}

/** A weak signal: under 48 KB/s over the last 5 seconds of a transfer that has run that long. */
export const SLOW_BYTES_PER_SECOND = 48 * 1024;
export const SLOW_WINDOW_MS = 5_000;

/** Whether a batch's recent progress reads as a thin signal. */
export function isSlow(samples: readonly Sample[], now: number): boolean {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return false;
  if (now - first.at < SLOW_WINDOW_MS) return false;
  const from = [...samples].reverse().find((s) => now - s.at >= SLOW_WINDOW_MS) ?? first;
  const seconds = (now - from.at) / 1000;
  return (last.sent - from.sent) / seconds < SLOW_BYTES_PER_SECOND;
}

/** Keeps the samples a slow check needs: the window and one reading before it. */
export function keepSamples(samples: readonly Sample[], next: Sample): Sample[] {
  const all = [...samples, next];
  const cut = all.findIndex((s) => next.at - s.at < SLOW_WINDOW_MS);
  return cut <= 1 ? all : all.slice(cut - 1);
}
