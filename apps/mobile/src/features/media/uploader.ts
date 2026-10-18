import type { FarmId } from '@kithfield/contracts';

import type { EnqueueResult } from '../../data';
import { transferItem, type TransferDeps } from './transfer';
import {
  commandOf,
  isSlow,
  keepSamples,
  newItem,
  retryDelayMs,
  type BatchMessage,
  type LocalMedia,
  type Sample,
  type UploadBatch,
  type UploadItem,
} from './upload-model';
import type { UploadStore } from './upload-store';

/*
 * The upload queue: like the outbox, but for bytes. A batch is one message (photos with a caption,
 * a voice note, files); its items go up two at a time, each retried with back-off until it is up
 * or fails for good, and once all are up the message goes into the farm's outbox with their keys.
 * The queue is saved as it changes, so it carries on after the app is closed.
 */

export interface UploaderDeps extends TransferDeps {
  readonly store: UploadStore;
  /** Queues a write on a farm: the data layer's `client.send`. */
  readonly send: (farm: FarmId, kind: string, payload: unknown) => Promise<EnqueueResult>;
  /** A smaller copy of a photo (for "Send smaller copies"), as a new file. */
  readonly shrink: (item: UploadItem, longSide: number) => Promise<LocalMedia>;
  readonly newId: () => string;
  readonly concurrency?: number;
}

/** Sent batches stay a day, so the sender's own photos show from the phone while they settle. */
const KEEP_SENT_MS = 24 * 60 * 60_000;
/** Progress redraws at most this often; the rings animate between readings. */
const EMIT_MS = 100;
export const SMALLER_LONG_SIDE = 1600;

export class Uploader {
  private batches: UploadBatch[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly active = new Map<string, AbortController>();
  private readonly sending = new Set<string>();
  private readonly samples = new Map<string, Sample[]>();
  private started: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly deps: UploaderDeps) {}

  /** Loads the saved queue once and carries on with it. */
  start(): Promise<void> {
    this.started ??= this.deps.store.load().then((saved) => {
      // Whatever was mid-transfer when the app went resumes from what the server has.
      this.batches = saved.map((b) => ({
        ...b,
        items: b.items.map((i) => (i.phase === 'uploading' ? { ...i, phase: 'waiting' } : i)),
      }));
      this.emit();
      this.pump();
    });
    return this.started;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): readonly UploadBatch[] => this.batches;

  /** Whether a batch is going up on a thin signal. */
  isSlow(batch: string): boolean {
    return isSlow(this.samples.get(batch) ?? [], this.deps.now());
  }

  /** The file on this phone for an uploaded key, while the queue still holds it. */
  localUriFor(key: string): string | null {
    for (const batch of this.batches) {
      const item = batch.items.find((i) => i.key === key);
      if (item !== undefined) return item.uri;
    }
    return null;
  }

  /** Adds a message's media to the queue; answers the batch id. */
  async enqueue(farm: FarmId, message: BatchMessage, media: readonly LocalMedia[]) {
    await this.start();
    const batch: UploadBatch = {
      id: this.deps.newId(),
      farm,
      message,
      items: media.map((m) => newItem(this.deps.newId(), m)),
      createdAt: this.deps.now(),
      phase: 'uploading',
      opId: null,
      sentAt: null,
      retryAt: 0,
    };
    this.batches = [...this.batches, batch];
    this.changed();
    return batch.id;
  }

  /** Stops one item and drops it from its message; a message left with nothing goes too. */
  cancel(batchId: string, itemId?: string): void {
    const batch = this.batches.find((b) => b.id === batchId);
    if (batch === undefined || batch.phase === 'sent') return;
    const going = batch.items.filter((i) => itemId === undefined || i.id === itemId);
    for (const item of going) {
      this.active.get(item.id)?.abort();
      this.deps.transport.remove(item.uri);
    }
    const items = batch.items.filter((i) => !going.includes(i));
    this.batches =
      items.length === 0 || batch.message.command === 'voice'
        ? this.batches.filter((b) => b.id !== batchId)
        : this.batches.map((b) => (b.id === batchId ? { ...b, items } : b));
    this.changed();
  }

  /** Tries the failed items of a message again, now. */
  retry(batchId: string): void {
    this.updateBatch(batchId, (b) => ({
      ...b,
      phase: b.phase === 'failed' ? 'uploading' : b.phase,
      retryAt: 0,
      items: b.items.map((i) =>
        i.phase === 'failed' || i.phase === 'waiting'
          ? { ...i, phase: 'waiting', failure: null, attempts: 0, refusals: 0, retryAt: 0 }
          : i,
      ),
    }));
    this.changed();
  }

  /** Re-encodes a message's unsent photos at 1600 px and sends those instead. */
  async sendSmaller(batchId: string): Promise<void> {
    const batch = this.batches.find((b) => b.id === batchId);
    if (batch === undefined) return;
    for (const item of batch.items) {
      if (item.kind !== 'photo' || item.phase === 'done') continue;
      this.active.get(item.id)?.abort();
      const smaller = await this.deps.shrink(item, SMALLER_LONG_SIDE);
      if (smaller.bytes >= item.bytes) continue;
      this.deps.transport.remove(item.uri);
      this.patchItem(batchId, item.id, { ...newItem(item.id, smaller) });
    }
    this.samples.delete(batchId);
    this.changed();
  }

  private updateBatch(id: string, update: (b: UploadBatch) => UploadBatch): void {
    this.batches = this.batches.map((b) => (b.id === id ? update(b) : b));
  }

  private patchItem(batchId: string, itemId: string, patch: Partial<UploadItem>): void {
    this.updateBatch(batchId, (b) => ({
      ...b,
      items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    }));
  }

  private emit(): void {
    if (this.emitTimer !== null) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    for (const listener of this.listeners) listener();
  }

  /** A change worth keeping: tell, save, and look for work. */
  private changed(): void {
    this.emit();
    const snapshot = this.batches;
    this.saving = this.saving.then(() => this.deps.store.save(snapshot)).catch(() => undefined);
    this.pump();
  }

  private progress(batchId: string, itemId: string, sentBytes: number): void {
    this.patchItem(batchId, itemId, { sentBytes });
    const batch = this.batches.find((b) => b.id === batchId);
    const sent = batch?.items.reduce((sum, i) => sum + i.sentBytes, 0) ?? 0;
    const at = this.deps.now();
    this.samples.set(batchId, keepSamples(this.samples.get(batchId) ?? [], { at, sent }));
    this.emitTimer ??= setTimeout(() => this.emit(), EMIT_MS);
  }

  private pump(): void {
    if (this.started === null) return;
    const now = this.deps.now();
    this.batches = this.batches.filter((b) => {
      const expired = b.phase === 'sent' && (b.sentAt ?? 0) + KEEP_SENT_MS < now;
      if (expired) for (const i of b.items) this.deps.transport.remove(i.uri);
      return !expired;
    });
    for (const batch of this.batches) {
      const ready = batch.items.length > 0 && batch.items.every((i) => i.phase === 'done');
      if (batch.phase === 'uploading' && ready && batch.retryAt <= now) void this.sendBatch(batch);
    }
    const slots = (this.deps.concurrency ?? 2) - this.active.size;
    const waiting = this.batches
      .filter((b) => b.phase === 'uploading')
      .flatMap((b) => b.items.map((item) => ({ batch: b, item })))
      .filter(({ item }) => item.phase === 'waiting' && !this.active.has(item.id));
    for (const { batch, item } of waiting
      .filter(({ item }) => item.retryAt <= now)
      .slice(0, slots)) {
      void this.runItem(batch.id, batch.farm, item);
    }
    const next = Math.min(
      ...waiting.map(({ item }) => item.retryAt).filter((at) => at > now),
      ...this.batches.filter((b) => b.retryAt > now).map((b) => b.retryAt),
    );
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = Number.isFinite(next) ? setTimeout(() => this.pump(), next - now) : null;
  }

  private async runItem(batchId: string, farm: FarmId, item: UploadItem): Promise<void> {
    const abort = new AbortController();
    this.active.set(item.id, abort);
    this.patchItem(batchId, item.id, { phase: 'uploading' });
    this.emit();
    const after = await transferItem(farm, item, this.deps, {
      save: (saved) => {
        this.patchItem(batchId, item.id, saved);
        this.changed();
      },
      progress: (sent) => this.progress(batchId, item.id, sent),
      signal: abort.signal,
    });
    this.active.delete(item.id);
    // Cancelled or replaced while it ran: what the run answers no longer applies.
    if (abort.signal.aborted) return this.pump();
    this.patchItem(batchId, item.id, after);
    this.changed();
  }

  private async sendBatch(batch: UploadBatch): Promise<void> {
    if (this.sending.has(batch.id)) return;
    this.sending.add(batch.id);
    try {
      const { kind, payload } = commandOf(batch);
      const result = await this.deps.send(batch.farm, kind, payload);
      this.updateBatch(batch.id, (b) =>
        result.status === 'queued'
          ? { ...b, phase: 'sent', opId: result.opId, sentAt: this.deps.now() }
          : { ...b, phase: 'failed' },
      );
    } catch {
      this.updateBatch(batch.id, (b) => ({ ...b, retryAt: this.deps.now() + retryDelayMs(1) }));
    } finally {
      this.sending.delete(batch.id);
    }
    this.samples.delete(batch.id);
    this.changed();
  }
}
