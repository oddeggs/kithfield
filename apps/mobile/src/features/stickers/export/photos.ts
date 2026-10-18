import type { Art } from '@kithfield/art';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';

import { bakeSticker } from './bake';
import { MESSAGES_SPEC, messagesCurrent, stickerFolder } from './messages';
import type { PackSticker } from './pack';

export type PhotosResult = 'saved' | 'denied' | 'failed';

/**
 * Saves the pack to Photos as looping pictures (animated PNGs). The Messages drawer's files are
 * used when they are current; otherwise each sticker is made again into the cache first.
 */
export async function saveToPhotos(
  art: Art,
  stickers: readonly PackSticker[],
): Promise<PhotosResult> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';
  try {
    const folder = stickerFolder();
    const current = folder !== null && (await messagesCurrent(stickers));
    const out = new Directory(Paths.cache, 'stickers-photos');
    if (!current && !out.exists) out.create({ intermediates: true });
    for (const s of stickers) {
      let file: File;
      if (current && folder) {
        file = new File(folder, `${s.stem}.png`);
      } else {
        const bytes = await bakeSticker(art, s.attrs, MESSAGES_SPEC);
        if (bytes === null) return 'failed';
        file = new File(out, `${s.stem}.png`);
        if (file.exists) file.delete();
        file.create();
        await file.write(bytes);
      }
      await MediaLibrary.saveToLibraryAsync(file.uri);
    }
    return 'saved';
  } catch {
    return 'failed';
  }
}
