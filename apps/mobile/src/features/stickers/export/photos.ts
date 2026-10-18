import type { Art } from '@kithfield/art';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';

import { bakeSticker } from './bake';
import { MESSAGES_SPEC, messagesCurrent, stickerFolder } from './messages';
import type { PackSticker } from './pack';
import { bakeQueue } from './queue';

export type PhotosResult = 'saved' | 'denied' | 'failed' | 'cancelled';

/**
 * Saves the pack to Photos as looping pictures (animated PNGs), through the one bake queue. The
 * Messages drawer's files are used when they are current; otherwise each sticker is made again
 * into the cache first. Says how far it got, and stops between stickers when cancelled.
 */
export async function saveToPhotos(
  art: Art,
  stickers: readonly PackSticker[],
  onProgress: (done: number, total: number) => void = () => undefined,
  cancelled: () => boolean = () => false,
): Promise<PhotosResult> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';
  return bakeQueue(async () => {
    try {
      const folder = stickerFolder();
      const current = folder !== null && (await messagesCurrent(stickers));
      const out = new Directory(Paths.cache, 'stickers-photos');
      if (!current && !out.exists) out.create({ intermediates: true });
      onProgress(0, stickers.length);
      for (const [i, s] of stickers.entries()) {
        if (cancelled()) return 'cancelled';
        let file: File;
        if (current && folder) {
          file = new File(folder, `${s.stem}.png`);
        } else {
          const baked = await bakeSticker(art, s.attrs, MESSAGES_SPEC, cancelled);
          if (baked === null) return 'cancelled';
          file = new File(out, `${s.stem}.png`);
          if (file.exists) file.delete();
          file.create();
          await file.write(baked.bytes);
        }
        await MediaLibrary.saveToLibraryAsync(file.uri);
        onProgress(i + 1, stickers.length);
      }
      return 'saved';
    } catch {
      return 'failed';
    }
  });
}
