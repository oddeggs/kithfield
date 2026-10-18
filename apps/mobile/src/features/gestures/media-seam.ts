import type { FarmId, MediaRef } from '@kithfield/contracts';

import { uploadKindOf } from './model/files';

/** A photo, video or document picked on the phone, before it goes up. */
export interface PickedFile {
  readonly uri: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
}

/**
 * The upload the media feature provides (`features/media`): it resizes or compresses what needs
 * it, asks for an upload URL (`POST /v1/media/upload-url`), puts the bytes and answers the stored
 * object as a `MediaRef`, reporting progress from 0 to 1 on the way.
 */
export interface MediaUploader {
  upload(
    farm: FarmId,
    file: PickedFile,
    kind: 'photo' | 'video' | 'file',
    onProgress?: (fraction: number) => void,
  ): Promise<MediaRef>;
}

let provided: MediaUploader | null = null;

/** Called once at startup by whoever owns uploads, so gestures can send photos and files. */
export function provideMediaUploader(uploader: MediaUploader): void {
  provided = uploader;
}

/** The uploader, or null in a build where none has been provided. */
export const mediaUploader = (): MediaUploader | null => provided;

/** Uploads picked files one by one and answers them as `MediaRef`s, in order. */
export async function uploadAll(
  uploader: MediaUploader,
  farm: FarmId,
  files: readonly PickedFile[],
  onProgress?: (file: PickedFile, fraction: number) => void,
): Promise<MediaRef[]> {
  const refs: MediaRef[] = [];
  for (const file of files) {
    const ref = await uploader.upload(farm, file, uploadKindOf(file.mime), (f) =>
      onProgress?.(file, f),
    );
    refs.push({ ...ref, name: ref.name ?? file.name });
  }
  return refs;
}
