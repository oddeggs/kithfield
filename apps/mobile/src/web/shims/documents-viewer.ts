/**
 * `@react-native-documents/viewer` in the browser: the browser opens the file itself, in a new
 * tab, from the app's file table or straight from its URL. Web builds only.
 */
import { File } from './expo-file-system';

export function viewDocument({ uri }: { uri: string; mimeType?: string }): Promise<null> {
  const blob = uri.startsWith('file:') ? new File(uri).blob() : null;
  const href = blob ? URL.createObjectURL(blob) : uri;
  window.open(href, '_blank', 'noopener');
  return Promise.resolve(null);
}
