import type { MediaRef } from '@kithfield/contracts';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * A file on this phone for a piece of media, to save or pass along: the phone's own copy as it
 * is, else the signed read downloaded into the cache.
 */
export async function localCopy(url: string, ref: MediaRef, name: string): Promise<string> {
  if (!url.startsWith('http')) return url;
  const ext = ref.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const local = `${FileSystem.cacheDirectory}kithfield-${name}.${ext}`;
  await FileSystem.downloadAsync(url, local);
  return local;
}
