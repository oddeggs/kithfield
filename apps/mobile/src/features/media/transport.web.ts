import { Directory, File, Paths } from '../../web/shims/expo-file-system';

/*
 * The browser's side of the bytes: PUTs of files the person picked or dropped, from the page's
 * file table, with progress; part files cut with `Blob.slice`. The phone's version uploads from
 * disk in a background session (`transport.ts`); a page uploads while it is open.
 */

export interface PutResult {
  readonly status: number;
  readonly etag: string | null;
}

export interface PutOptions {
  readonly headers: Readonly<Record<string, string>>;
  readonly onProgress: (sent: number) => void;
  readonly signal: AbortSignal;
}

export interface Transport {
  put(url: string, fileUri: string, options: PutOptions): Promise<PutResult>;
  slice(fileUri: string, offset: number, length: number): Promise<string>;
  size(fileUri: string): number | null;
  remove(fileUri: string): void;
}

/** Where the queue keeps its files and its state. */
export const uploadsDirectory = (): Directory => {
  const dir = new Directory(Paths.document, 'media-uploads');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};

const blobOf = (fileUri: string): Blob => {
  const blob = new File(fileUri).blob();
  if (blob === null) throw new Error('the file is gone');
  return blob;
};

export const nativeTransport: Transport = {
  put(url, fileUri, { headers, onProgress, signal }) {
    return new Promise((resolve, reject) => {
      const body = blobOf(fileUri);
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (e) => onProgress(e.loaded);
      xhr.onload = () => resolve({ status: xhr.status, etag: xhr.getResponseHeader('etag') });
      xhr.onerror = () => reject(new Error('upload failed'));
      xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(body);
    });
  },

  slice(fileUri, offset, length) {
    return new Promise((resolve) => {
      const part = new File(
        uploadsDirectory(),
        'parts',
        `${Date.now().toString(36)}-${offset}.part`,
      );
      part.put(blobOf(fileUri).slice(offset, offset + length));
      resolve(part.uri);
    });
  },

  size(fileUri) {
    const file = new File(fileUri);
    return file.exists ? file.size : null;
  },

  remove(fileUri) {
    const file = new File(fileUri);
    if (file.exists) file.delete();
  },
};
