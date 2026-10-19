/**
 * `expo-file-system/legacy` in the browser: the few calls the app makes, on the same file table
 * as `expo-file-system` (`./expo-file-system`). Web builds only.
 */
import { Directory, File, Paths } from './expo-file-system';

export const documentDirectory: string | null = Paths.document.uri;
export const cacheDirectory: string | null = Paths.cache.uri;

export const readAsStringAsync = (uri: string): Promise<string> => new File(uri).text();

const settle = <T>(task: () => T): Promise<T> => new Promise((resolve) => resolve(task()));

export const writeAsStringAsync = (uri: string, text: string): Promise<void> =>
  settle(() => new File(uri).write(text));

export const makeDirectoryAsync = (uri: string): Promise<void> =>
  settle(() => new Directory(uri).create());

export const getInfoAsync = (uri: string): Promise<{ exists: boolean; uri: string }> =>
  settle(() => ({ exists: new File(uri).exists || new Directory(uri).exists, uri }));

export const deleteAsync = (uri: string): Promise<void> =>
  settle(() => {
    const file = new File(uri);
    if (file.exists) file.delete();
  });

/** Fetches a URL into a file the app can hand on (open, share). */
export async function downloadAsync(
  url: string,
  uri: string,
): Promise<{ uri: string; status: number; headers: Record<string, string> }> {
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(`download failed: ${answer.status}`);
  new File(uri).put(await answer.blob());
  return { uri, status: answer.status, headers: {} };
}
