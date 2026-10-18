import type { RefusedWrite, UnsentWrite } from './timeline';

/*
 * Messages of photos, video or a voice note still going up (the media queue's batches), drawn as
 * your writes on their way: once every file is up the queue puts the real write in the outbox and
 * the chat follows that instead.
 */

/** The parts of the media queue's `UploadBatch` the chat draws. */
export interface UploadingMessage {
  readonly id: string;
  readonly phase: 'uploading' | 'sent' | 'failed';
  readonly opId: string | null;
  readonly createdAt: number;
  readonly message:
    | { readonly command: 'media'; readonly caption?: string; readonly replyTo?: number }
    | {
        readonly command: 'voice';
        readonly durationMs: number;
        readonly waveform: readonly number[];
        readonly replyTo?: number;
      };
  readonly items: readonly {
    readonly key: string | null;
    readonly mime: string;
    readonly bytes: number;
    readonly width?: number;
    readonly height?: number;
    readonly durationMs?: number;
    readonly failure: string | null;
  }[];
}

/** The op id a message going up is drawn under, apart from any real write's. */
export const uploadOpId = (batch: string): string => `upload:${batch}`;

/** The batch an upload draft stands for, or null for a real write. */
export const uploadOf = (opId: string): string | null =>
  opId.startsWith('upload:') ? opId.slice('upload:'.length) : null;

function payloadOf(batch: UploadingMessage): unknown {
  const refs = batch.items.map((i) => ({
    key: i.key ?? '',
    mime: i.mime,
    bytes: i.bytes,
    ...(i.width !== undefined ? { width: i.width } : {}),
    ...(i.height !== undefined ? { height: i.height } : {}),
    ...(i.durationMs !== undefined ? { durationMs: i.durationMs } : {}),
  }));
  const replyTo = batch.message.replyTo !== undefined ? { replyTo: batch.message.replyTo } : {};
  if (batch.message.command === 'voice') {
    const { durationMs, waveform } = batch.message;
    return {
      audio: { ...refs[0], durationMs },
      durationMs,
      waveform: [...waveform],
      ...replyTo,
    };
  }
  const caption = batch.message.caption ? { caption: batch.message.caption } : {};
  return { items: refs, ...caption, ...replyTo };
}

/**
 * Upload drafts for the timeline: messages still going up as unsent writes, those that stopped as
 * refused ones (with the first item's reason). A message whose write is already queued, or
 * already in the outbox, is left to it.
 */
export function uploadDrafts(
  batches: readonly UploadingMessage[],
  pending: ReadonlySet<string>,
): { unsent: UnsentWrite[]; refused: RefusedWrite[] } {
  const unsent: UnsentWrite[] = [];
  const refused: RefusedWrite[] = [];
  for (const b of batches) {
    if (b.phase === 'sent' || (b.opId !== null && pending.has(b.opId))) continue;
    const draft = {
      opId: uploadOpId(b.id),
      kind: b.message.command,
      payload: payloadOf(b),
    };
    if (b.phase === 'failed') {
      const reason = b.items.find((i) => i.failure !== null)?.failure ?? 'other';
      refused.push({ ...draft, farm: '', reason, at: b.createdAt });
    } else {
      unsent.push({ ...draft, createdAt: b.createdAt, acked: false });
    }
  }
  return { unsent, refused };
}
