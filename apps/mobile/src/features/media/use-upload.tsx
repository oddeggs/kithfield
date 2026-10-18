import type { FarmId, Seq } from '@kithfield/contracts';
import { getRandomBytes, randomUUID } from 'expo-crypto';
import type { DocumentPickerAsset } from 'expo-document-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useDataClient } from '../../data';
import { createOpIdMaker } from '../../data/op-id';
import { dataClient, handOverDataClient, nativeMediaApi } from './native-api';
import { encodePhoto, prepareAsset, prepareDocument, prepareVoice } from './prepare';
import { ReadUrls } from './read-urls';
import { nativeTransport, uploadsDirectory } from './transport';
import type { LocalMedia, UploadBatch } from './upload-model';
import { fileUploadStore } from './upload-store';
import { Uploader } from './uploader';

/*
 * The app's one upload queue and read-URL cache, and the hooks screens use. The queue sends its
 * finished messages through the data layer's outbox (`client.send`), so it takes the data client
 * from the first screen that uses it.
 */

let uploader: Uploader | null = null;
let reads: ReadUrls | null = null;

const sharedUploader = (): Uploader =>
  (uploader ??= new Uploader({
    api: nativeMediaApi(),
    transport: nativeTransport,
    store: fileUploadStore,
    now: Date.now,
    newId: randomUUID,
    newOpId: createOpIdMaker(getRandomBytes),
    // The message's own op id: a send repeated after a crash is queued once.
    sendCommand: (farm, kind, payload, opId) => {
      const client = dataClient();
      return client === null
        ? Promise.reject(new Error('the data layer has not started'))
        : client.send(farm, kind, payload, opId);
    },
    shrink: (item, longSide) => encodePhoto(item.uri, item.width ?? 0, item.height ?? 0, longSide),
  }));

const sharedReads = (): ReadUrls => (reads ??= new ReadUrls(nativeMediaApi()));

/** Starts the queue (once) with the data layer's client. */
function useStarted(): Uploader {
  handOverDataClient(useDataClient());
  const queue = sharedUploader();
  useEffect(() => {
    void queue.start();
  }, [queue]);
  return queue;
}

export interface MessageOptions {
  readonly caption?: string;
  readonly replyTo?: Seq;
  readonly doodle?: boolean;
}

export interface VoiceNote {
  /** The recording from `useAudioRecorder(VOICE_RECORDING_OPTIONS)`. */
  readonly uri: string;
  readonly durationMs: number;
  /** Levels 0–255, at most 64. */
  readonly waveform: readonly number[];
  readonly replyTo?: Seq;
}

/**
 * Sending media. Each call prepares the files (resizing photos), puts them in the queue and
 * answers the batch id; the queue uploads them, then sends the `media` or `voice` command with
 * their keys. Preparing throws `MediaRefused` for something that can't go (too big, unreadable).
 */
export function useUpload() {
  const queue = useStarted();
  return useMemo(
    () => ({
      /** Photos and videos from `pickFromLibrary` or `captureWithCamera`, as one message. */
      sendPicked: async (
        farm: FarmId,
        assets: readonly ImagePickerAsset[],
        options: MessageOptions = {},
      ) =>
        queue.enqueue(
          farm,
          { command: 'media', ...options },
          await Promise.all(assets.map(prepareAsset)),
        ),
      /** Files from the document picker, as one message. */
      sendDocuments: async (
        farm: FarmId,
        assets: readonly DocumentPickerAsset[],
        options: MessageOptions = {},
      ) =>
        queue.enqueue(
          farm,
          { command: 'media', ...options },
          await Promise.all(assets.map(prepareDocument)),
        ),
      /** Media already prepared (a doodle drawn in the app, a forwarded photo kept on the phone). */
      sendPrepared: (farm: FarmId, media: readonly LocalMedia[], options: MessageOptions = {}) =>
        queue.enqueue(farm, { command: 'media', ...options }, media),
      sendVoice: async (farm: FarmId, note: VoiceNote) =>
        queue.enqueue(
          farm,
          {
            command: 'voice',
            durationMs: note.durationMs,
            waveform: note.waveform,
            ...(note.replyTo !== undefined ? { replyTo: note.replyTo } : {}),
          },
          [await prepareVoice(note.uri, note.durationMs)],
        ),
      /** Stops one item (or the whole message without `item`). */
      cancel: (batch: string, item?: string) => queue.cancel(batch, item),
      retry: (batch: string) => queue.retry(batch),
      sendSmaller: (batch: string) => queue.sendSmaller(batch),
    }),
    [queue],
  );
}

/** The messages going up (and those sent in the last day) on a farm, oldest first. */
export function useUploads(farm: FarmId): readonly UploadBatch[] {
  const queue = useStarted();
  const all = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  return useMemo(() => all.filter((b) => b.farm === farm), [all, farm]);
}

/** Whether a message is going up on a thin signal (the weak-signal card and "Sending slowly"). */
export function useUploadSlow(batch: string): boolean {
  const queue = useStarted();
  return useSyncExternalStore(queue.subscribe, () => queue.isSlow(batch));
}

/** A signed read URL for a key (null until it arrives, or when it can't be had). */
export function useSignedUrl(key: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    key === null ? null : sharedReads().peek(key),
  );
  useEffect(() => {
    if (key === null) return;
    let live = true;
    void sharedReads()
      .get(key)
      .then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [key]);
  return url;
}

/**
 * Where to show an uploaded item from: the file on this phone while the queue holds it, else a
 * signed URL. Pass it to `expo-image` with `cacheKey: key`, so a fresh URL for the same object
 * hits the disk cache.
 */
export function useMediaUrl(key: string | null): string | null {
  const queue = useStarted();
  const local = key === null ? null : queue.localUriFor(key);
  const signed = useSignedUrl(local === null ? key : null);
  return local ?? signed;
}

/**
 * Mount once under the data layer so the queue resumes at launch, not only when a chat opens.
 * Draws nothing.
 */
export function MediaUploads(): null {
  useStarted();
  return null;
}

/** Messages not yet in the farm's outbox: for the "these haven't sent" warning before signing out. */
export async function pendingUploadCount(): Promise<number> {
  const queue = sharedUploader();
  await queue.start();
  return queue.pendingCount();
}

/**
 * Signing out, or the phone moving to another person: stops every upload, forgets the queue,
 * deletes its files and the read URLs this person was given.
 */
export async function clearMediaForSignOut(): Promise<void> {
  await sharedUploader().clear();
  reads = null;
  const dir = uploadsDirectory();
  if (dir.exists) dir.delete();
}
