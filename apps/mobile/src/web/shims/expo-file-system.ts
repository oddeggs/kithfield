/**
 * `expo-file-system` in the browser, which has no app folders: the same `File`, `Directory` and
 * `Paths` over a small file table. Text files under the document folder are kept in this
 * origin's storage, so they outlive a reload as on the phone; bytes (photos waiting to upload)
 * live for the page's life. Metro resolves the module here for web builds only.
 */
import { browserStorage } from '../storage';

type Content = string | Blob;

const ROOT = 'file:///';
const DOCUMENT = `${ROOT}document/`;
const CACHE = `${ROOT}cache/`;
const KEPT_PREFIX = 'kithfield.fs:';
/** Text larger than this stays in memory only: the origin's storage is a few megabytes. */
const KEEP_UP_TO = 256 * 1024;

const files = new Map<string, Content>();
const folders = new Set<string>([ROOT, DOCUMENT, CACHE]);
const storage = browserStorage();

const kept = (uri: string) => uri.startsWith(DOCUMENT);

function persist(uri: string, content: Content | null): void {
  if (!kept(uri)) return;
  try {
    if (typeof content === 'string' && content.length <= KEEP_UP_TO) {
      storage.setItem(KEPT_PREFIX + uri, content);
    } else {
      void storage.deleteItemAsync(KEPT_PREFIX + uri);
    }
  } catch {
    // Storage full or refused: the file lives in memory for this page.
  }
}

function recall(uri: string): Content | undefined {
  const inMemory = files.get(uri);
  if (inMemory !== undefined) return inMemory;
  if (!kept(uri)) return undefined;
  const text = storage.getItem(KEPT_PREFIX + uri);
  if (text === null) return undefined;
  files.set(uri, text);
  return text;
}

const parentOf = (uri: string) => uri.replace(/[^/]+\/?$/, '');
const baseName = (uri: string) => uri.replace(/\/$/, '').split('/').pop() ?? '';
const asFolder = (uri: string) => (uri.endsWith('/') ? uri : `${uri}/`);

function join(parts: readonly (string | File | Directory)[]): string {
  let out = '';
  for (const part of parts) {
    const piece = typeof part === 'string' ? part : part.uri;
    if (out === '' || /^[a-z]+:\/\//.test(piece)) out = piece;
    else out = `${asFolder(out)}${piece.replace(/^\/+/, '')}`;
  }
  return out;
}

function ensureFolders(uri: string): void {
  let folder = parentOf(uri);
  while (folder.length > ROOT.length && !folders.has(folder)) {
    folders.add(folder);
    folder = parentOf(folder.slice(0, -1));
  }
}

const textOf = async (content: Content) =>
  typeof content === 'string' ? content : await content.text();

export class File {
  readonly uri: string;

  constructor(...parts: (string | File | Directory)[]) {
    this.uri = join(parts);
  }

  get name(): string {
    return baseName(this.uri);
  }

  get exists(): boolean {
    return recall(this.uri) !== undefined;
  }

  get size(): number {
    const content = recall(this.uri);
    if (content === undefined) return 0;
    return typeof content === 'string' ? new Blob([content]).size : content.size;
  }

  get type(): string {
    const content = recall(this.uri);
    return content instanceof Blob ? content.type : 'text/plain';
  }

  create(_options?: { overwrite?: boolean; intermediates?: boolean }): void {
    ensureFolders(this.uri);
    files.set(this.uri, '');
    persist(this.uri, '');
  }

  write(content: string | Uint8Array): void {
    ensureFolders(this.uri);
    const value: Content =
      typeof content === 'string' ? content : new Blob([content as Uint8Array<ArrayBuffer>]);
    files.set(this.uri, value);
    persist(this.uri, value);
  }

  async text(): Promise<string> {
    const content = recall(this.uri);
    if (content === undefined) throw new Error(`No file at ${this.uri}`);
    return textOf(content);
  }

  textSync(): string {
    const content = recall(this.uri);
    if (typeof content !== 'string') throw new Error(`No text file at ${this.uri}`);
    return content;
  }

  async bytes(): Promise<Uint8Array> {
    const content = recall(this.uri);
    if (content === undefined) throw new Error(`No file at ${this.uri}`);
    return new Uint8Array(await new Blob([content]).arrayBuffer());
  }

  /** The file's bytes as a `Blob`, for uploads and `<img>`s (web only). */
  blob(): Blob | null {
    const content = recall(this.uri);
    return content === undefined ? null : new Blob([content]);
  }

  delete(): void {
    files.delete(this.uri);
    persist(this.uri, null);
  }

  copy(to: File | Directory): void {
    const content = recall(this.uri);
    if (content === undefined) throw new Error(`No file at ${this.uri}`);
    const target = to instanceof Directory ? new File(to, this.name) : to;
    target.put(content);
  }

  moveSync(to: File | Directory): void {
    this.copy(to);
    this.delete();
  }

  move(to: File | Directory): void {
    this.moveSync(to);
  }

  /** Stores content as is (web only). */
  put(content: Content): void {
    ensureFolders(this.uri);
    files.set(this.uri, content);
    persist(this.uri, content);
  }
}

export class Directory {
  readonly uri: string;

  constructor(...parts: (string | File | Directory)[]) {
    this.uri = asFolder(join(parts));
  }

  get name(): string {
    return baseName(this.uri);
  }

  get exists(): boolean {
    return folders.has(this.uri);
  }

  create(_options?: { intermediates?: boolean; idempotent?: boolean }): void {
    ensureFolders(`${this.uri}x`);
  }

  delete(): void {
    for (const uri of [...files.keys()]) {
      if (uri.startsWith(this.uri)) new File(uri).delete();
    }
    for (const folder of [...folders]) if (folder.startsWith(this.uri)) folders.delete(folder);
  }

  list(): (File | Directory)[] {
    const out: (File | Directory)[] = [];
    for (const folder of folders) {
      if (folder !== this.uri && parentOf(folder.slice(0, -1)) === this.uri) {
        out.push(new Directory(folder));
      }
    }
    const names = new Set<string>(files.keys());
    if (kept(this.uri)) {
      for (let i = 0; ; i += 1) {
        const key = (globalThis.localStorage as Storage | undefined)?.key(i);
        if (key === null || key === undefined) break;
        if (key.startsWith(KEPT_PREFIX)) names.add(key.slice(KEPT_PREFIX.length));
      }
    }
    for (const uri of names) if (parentOf(uri) === this.uri) out.push(new File(uri));
    return out;
  }
}

export const Paths = {
  document: new Directory(DOCUMENT),
  cache: new Directory(CACHE),
  /** No App Group in the browser: widgets and extensions don't exist here. */
  appleSharedContainers: {} as Record<string, Directory>,
};

/** Keeps a file the person picked or dropped as a file the app can read and upload. */
export function fileFromBlob(blob: Blob, name: string): File {
  const safe = name.replace(/[^\w.-]+/g, '_');
  const file = new File(Paths.cache, 'picked', `${Date.now().toString(36)}-${safe}`);
  file.put(blob);
  return file;
}

export const UploadType = { BINARY_CONTENT: 0, MULTIPART: 1 } as const;

/** Uploads in the browser go through `transport.web.ts`; nothing reaches this. */
export class UploadTask {
  constructor() {
    throw new Error('UploadTask is not available in the browser');
  }
}
