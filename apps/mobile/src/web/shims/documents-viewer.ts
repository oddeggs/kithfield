/**
 * `@react-native-documents/viewer` in the browser. A file someone shared opens in a new tab only
 * when the browser shows it as an inert document (a PDF, a picture, a recording); anything else
 * (a web page, an SVG, text a browser might read as a page) is downloaded instead, since a page
 * opened from the app's own address could run as the app. Web builds only.
 */
import { File } from './expo-file-system';

/** Kinds a browser shows without running anything in them. */
const SHOWN =
  /^(application\/pdf|image\/(png|jpeg|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|ogg|wav|webm|x-m4a))$/;

const isWebAddress = (uri: string) => /^https:\/\//i.test(uri);

/** The file's own name: the app keeps it encoded in its path. */
function nameOf(uri: string): string {
  const name = new File(uri).name;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function download(href: string, name: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function viewDocument({ uri, mimeType }: { uri: string; mimeType?: string }): Promise<null> {
  const type = (mimeType ?? '').toLowerCase();
  const shown = SHOWN.test(type);
  if (uri.startsWith('file:')) {
    const content = new File(uri).blob();
    if (content === null) return Promise.reject(new Error(`No file at ${uri}`));
    // The bytes go out as the kind the chat says they are, never as whatever they look like.
    const blob = new Blob([content], { type: shown ? type : 'application/octet-stream' });
    const href = URL.createObjectURL(blob);
    if (shown) window.open(href, '_blank', 'noopener');
    else download(href, nameOf(uri));
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
    return Promise.resolve(null);
  }
  if (!isWebAddress(uri)) return Promise.reject(new Error('Not a web address'));
  window.open(uri, '_blank', 'noopener');
  return Promise.resolve(null);
}
