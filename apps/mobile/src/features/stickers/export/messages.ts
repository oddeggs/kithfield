import type { Art } from '@kithfield/art';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';

import { checkMessagesSticker, MESSAGES } from '@kithfield/art/stickers';
import { bakeSticker, type BakeSpec } from './bake';
import { packSignature, type PackSticker } from './pack';

/*
 * The Messages sticker drawer reads the App Group: every APNG in `surfaces/stickers/`, in file
 * name order, with `manifest.json` naming each one for VoiceOver. The app rewrites the folder
 * whenever the pack's drawing changes (an outfit, a coat, the language), and leaves it alone
 * otherwise.
 */

/** The folder in the App Group. */
export const STICKERS_FOLDER = 'surfaces/stickers/';
const MANIFEST = 'manifest.json';

/**
 * How the drawer's stickers are made: Messages takes up to 500 KB each, 300 to 618 px across.
 * The app's own rate (12 a second, on twos) fits in a 256-colour palette for most stickers.
 */
export const MESSAGES_SPEC: BakeSpec = {
  size: 408,
  fps: [12, 6],
  format: 'apng',
  maxBytes: MESSAGES.bytes,
  colours: [256, 160, 96],
};

/** Bumped when the way the drawer's files are made changes, so old ones are made again. */
const SIGNATURE = 'apng-palette-1';

export interface MessagesManifest {
  readonly signature: string;
  readonly stickers: readonly { readonly file: string; readonly label: string }[];
}

/** The App Group's sticker folder, or null where the App Group isn't there (tests, Android). */
export function stickerFolder(): Directory | null {
  const group = (Constants.expoConfig?.extra as { appGroup?: string } | undefined)?.appGroup;
  const root = group ? Paths.appleSharedContainers[group] : undefined;
  return root ? new Directory(root, STICKERS_FOLDER) : null;
}

async function readManifest(folder: Directory): Promise<MessagesManifest | null> {
  try {
    const file = new File(folder, MANIFEST);
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as MessagesManifest;
  } catch {
    return null;
  }
}

/** Whether the drawer already holds this pack as drawn now. */
export async function messagesCurrent(stickers: readonly PackSticker[]): Promise<boolean> {
  const folder = stickerFolder();
  if (!folder?.exists) return false;
  const manifest = await readManifest(folder);
  return (
    manifest?.signature === packSignature(stickers, SIGNATURE) &&
    manifest.stickers.every((s) => new File(folder, s.file).exists)
  );
}

export type MessagesResult = 'unchanged' | 'written' | 'unavailable' | 'cancelled';

let running: Promise<MessagesResult> | null = null;

/**
 * Brings the drawer up to date with the pack: bakes each sticker, writes it, then the manifest,
 * then takes away files of an older pack. One at a time; a second call while one runs waits for it.
 */
export function syncMessages(
  art: Art,
  stickers: readonly PackSticker[],
  onProgress: (done: number, total: number) => void = () => undefined,
  cancelled: () => boolean = () => false,
): Promise<MessagesResult> {
  const next = (running ?? Promise.resolve<MessagesResult>('unchanged'))
    .catch((): MessagesResult => 'unchanged')
    .then(() => write(art, stickers, onProgress, cancelled));
  running = next;
  return next;
}

async function write(
  art: Art,
  stickers: readonly PackSticker[],
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<MessagesResult> {
  const folder = stickerFolder();
  if (folder === null) return 'unavailable';
  if (await messagesCurrent(stickers)) return 'unchanged';
  if (!folder.exists) folder.create({ intermediates: true });
  const written: { file: string; label: string }[] = [];
  onProgress(0, stickers.length);
  for (const [i, s] of stickers.entries()) {
    const bytes = await bakeSticker(art, s.attrs, MESSAGES_SPEC, cancelled);
    if (bytes === null) return 'cancelled';
    if (checkMessagesSticker(bytes).length > 0 && __DEV__) {
      console.warn(`The ${s.id} sticker is over what Messages takes`, checkMessagesSticker(bytes));
    }
    const name = `${s.stem}.png`;
    const file = new File(folder, name);
    if (file.exists) file.delete();
    file.create();
    await file.write(bytes);
    written.push({ file: name, label: s.label });
    onProgress(i + 1, stickers.length);
  }
  const manifest: MessagesManifest = {
    signature: packSignature(stickers, SIGNATURE),
    stickers: written,
  };
  const m = new File(folder, MANIFEST);
  if (m.exists) m.delete();
  m.create();
  await m.write(JSON.stringify(manifest));
  const keep = new Set([MANIFEST, ...written.map((w) => w.file)]);
  for (const entry of folder.list()) {
    if (entry instanceof File && !keep.has(entry.name)) entry.delete();
  }
  return 'written';
}
