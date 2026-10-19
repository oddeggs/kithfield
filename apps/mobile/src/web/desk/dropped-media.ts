import { LIMITS } from '@kithfield/contracts';

import { PHOTO_LONG_SIDE, type LocalMedia } from '../../features/media';
import { photoSize } from '../../features/media/sizing';
import { fileFromBlob } from '../shims/expo-file-system';

/** JPEG quality for a photo made smaller before it goes up, as the phone's encoder uses. */
const JPEG_QUALITY = 0.85;

/** Whether a dropped or pasted file is something the chat sends as a photo or video. */
export const isMedia = (type: string): boolean =>
  type.startsWith('image/') || type.startsWith('video/');

async function photo(file: globalThis.File): Promise<LocalMedia> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = photoSize(bitmap.width, bitmap.height, PHOTO_LONG_SIDE);
  const size = { width, height };
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas');
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('could not encode the photo'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  );
  const kept = fileFromBlob(blob, file.name.replace(/\.[^.]+$/, '') + '.jpg');
  return { uri: kept.uri, kind: 'photo', mime: 'image/jpeg', bytes: blob.size, ...size };
}

function video(file: globalThis.File): LocalMedia {
  const kept = fileFromBlob(file, file.name);
  return { uri: kept.uri, kind: 'video', mime: file.type || 'video/mp4', bytes: file.size };
}

/**
 * Files dropped on the chat, ready for the upload queue: photos made smaller as the phone makes
 * them (long side 2048, JPEG), videos as they are. Anything too big or not a photo or video is
 * left out; the caller says so.
 */
export async function prepareDropped(
  files: readonly globalThis.File[],
): Promise<{ media: LocalMedia[]; skipped: number }> {
  const media: LocalMedia[] = [];
  let skipped = 0;
  for (const file of files.slice(0, LIMITS.mediaItems)) {
    if (!isMedia(file.type) || file.size > LIMITS.uploadBytes) {
      skipped += 1;
      continue;
    }
    try {
      media.push(file.type.startsWith('image/') ? await photo(file) : video(file));
    } catch {
      skipped += 1;
    }
  }
  return { media, skipped: skipped + Math.max(0, files.length - LIMITS.mediaItems) };
}
