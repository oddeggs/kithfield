import { Directory, File, Paths, UploadTask, UploadType } from 'expo-file-system';

/*
 * The phone's side of the bytes: PUTs from files on disk in a background URLSession (so an upload
 * keeps going while the app is in the background), part files cut from a big file, and the
 * queue's own folder.
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
  /** PUTs a file's bytes to a presigned URL. Throws when there is no answer at all. */
  put(url: string, fileUri: string, options: PutOptions): Promise<PutResult>;
  /** Copies `length` bytes from `offset` into a new file; answers its URI. */
  slice(fileUri: string, offset: number, length: number): Promise<string>;
  /** The size of a file on disk, or null when it is gone. */
  size(fileUri: string): number | null;
  remove(fileUri: string): void;
}

/** Where the queue keeps its files and its state: kept until sent, never in a purgeable cache. */
export const uploadsDirectory = (): Directory => {
  const dir = new Directory(Paths.document, 'media-uploads');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};

const partsDirectory = (): Directory => {
  const dir = new Directory(uploadsDirectory(), 'parts');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};

/** Reads in steps of 1 MiB, so cutting a 10 MiB part never holds it all at once. */
const COPY_STEP = 1024 * 1024;

export const nativeTransport: Transport = {
  async put(url, fileUri, { headers, onProgress, signal }) {
    const task = new UploadTask(new File(fileUri), url, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers: { ...headers },
      ...(headers['content-type'] !== undefined ? { mimeType: headers['content-type'] } : {}),
      sessionType: 'background',
      onProgress: ({ bytesSent }) => onProgress(bytesSent),
      signal,
    });
    try {
      const result = await task.uploadAsync();
      const etag = Object.entries(result.headers).find(([name]) => name.toLowerCase() === 'etag');
      return { status: result.status, etag: etag?.[1] ?? null };
    } finally {
      task.release();
    }
  },

  async slice(fileUri, offset, length) {
    const source = new File(fileUri).open();
    const part = new File(partsDirectory(), `${Date.now().toString(36)}-${offset}.part`);
    part.create({ overwrite: true });
    const out = part.open();
    try {
      source.offset = offset;
      let left = length;
      while (left > 0) {
        const bytes = await source.readBytes(Math.min(COPY_STEP, left));
        if (bytes.byteLength === 0) throw new Error('the file is shorter than expected');
        await out.writeBytes(bytes);
        left -= bytes.byteLength;
      }
    } finally {
      source.close();
      out.close();
    }
    return part.uri;
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
