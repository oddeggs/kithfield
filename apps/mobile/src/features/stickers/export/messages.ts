import type { Art } from '@kithfield/art';
import { MESSAGES } from '@kithfield/art/stickers';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';

import { bakeSticker, type BakeSpec } from './bake';
import type { PackSticker } from './pack';
import { bakePlan, stickerSignature } from './plan';
import { bakeQueue } from './queue';

/*
 * The Messages sticker drawer reads the App Group: every APNG in `surfaces/stickers/`, in file
 * name order, with `manifest.json` naming each one for VoiceOver. When the pack's drawing changes
 * (an outfit, a coat, the language) the app makes the stickers that changed into a folder beside
 * it, keeps the ones that didn't, and swaps the new folder in only once it is whole: the drawer
 * never offers half an old pack and half a new one. A bake cut short carries on where it stopped.
 */

/** The folder in the App Group (`APP_GROUP_PATHS` doesn't name it yet). */
export const STICKERS_FOLDER = 'surfaces/stickers/';
/** Where the next pack is made before it is swapped in. */
const NEXT_FOLDER = 'surfaces/stickers-next/';
const MANIFEST = 'manifest.json';
/** In the next folder: the stickers made so far, for carrying on after an interruption. */
const PROGRESS = 'progress.json';

/** Bumped when the way the drawer's files are made changes, so old ones are made again. */
const FORMAT = 'apng-palette-2';

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

interface Entry {
  readonly file: string;
  readonly label: string;
  /** What the file was made from (`stickerSignature`). */
  readonly sig: string;
}

export interface MessagesManifest {
  readonly stickers: readonly Entry[];
}

function groupRoot(): Directory | null {
  const group = (Constants.expoConfig?.extra as { appGroup?: string } | undefined)?.appGroup;
  return group ? (Paths.appleSharedContainers[group] ?? null) : null;
}

/** The App Group's sticker folder, or null where the App Group isn't there (tests, Android). */
export function stickerFolder(): Directory | null {
  const root = groupRoot();
  return root ? new Directory(root, STICKERS_FOLDER) : null;
}

async function readEntries(folder: Directory, name: string): Promise<Entry[]> {
  try {
    const file = new File(folder, name);
    if (!file.exists) return [];
    const parsed = JSON.parse(await file.text()) as Partial<MessagesManifest>;
    const list: unknown = parsed.stickers;
    return Array.isArray(list) ? (list as Entry[]) : [];
  } catch {
    return [];
  }
}

async function writeJson(folder: Directory, name: string, value: unknown): Promise<void> {
  const file = new File(folder, name);
  if (!file.exists) file.create();
  await file.write(JSON.stringify(value));
}

/** The stickers a folder holds as made, by file stem, when their files are there. */
function madeIn(folder: Directory, entries: readonly Entry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries)
    if (new File(folder, e.file).exists) out[e.file.replace(/\.png$/, '')] = e.sig;
  return out;
}

/** Whether the drawer already holds this pack as drawn now. */
export async function messagesCurrent(stickers: readonly PackSticker[]): Promise<boolean> {
  const folder = stickerFolder();
  if (!folder?.exists) return false;
  const entries = await readEntries(folder, MANIFEST);
  return (
    entries.length === stickers.length &&
    bakePlan(stickers, madeIn(folder, entries), FORMAT).make.length === 0
  );
}

export type MessagesResult = 'unchanged' | 'written' | 'unavailable' | 'cancelled';

/**
 * Brings the drawer up to date with the pack, through the one bake queue (never alongside a
 * WhatsApp or Photos bake).
 */
export function syncMessages(
  art: Art,
  stickers: readonly PackSticker[],
  onProgress: (done: number, total: number) => void = () => undefined,
  cancelled: () => boolean = () => false,
): Promise<MessagesResult> {
  return bakeQueue(() => write(art, stickers, onProgress, cancelled));
}

async function write(
  art: Art,
  stickers: readonly PackSticker[],
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<MessagesResult> {
  const root = groupRoot();
  if (root === null) return 'unavailable';
  if (await messagesCurrent(stickers)) return 'unchanged';
  const live = new Directory(root, STICKERS_FOLDER);
  const next = new Directory(root, NEXT_FOLDER);
  if (!next.exists) next.create({ intermediates: true });
  const progress = await readEntries(next, PROGRESS);
  const inNext = madeIn(next, progress);
  const inLive = live.exists ? madeIn(live, await readEntries(live, MANIFEST)) : {};
  const written: Entry[] = progress.filter((e) => inNext[e.file.replace(/\.png$/, '')] === e.sig);
  onProgress(0, stickers.length);
  for (const [i, s] of stickers.entries()) {
    const sig = stickerSignature(s, FORMAT);
    const name = `${s.stem}.png`;
    const target = new File(next, name);
    if (inNext[s.stem] !== sig) {
      if (inLive[s.stem] === sig) {
        if (target.exists) target.delete();
        new File(live, name).copySync(target);
      } else {
        const baked = await bakeSticker(art, s.attrs, MESSAGES_SPEC, cancelled);
        if (baked === null) return 'cancelled';
        if (target.exists) target.delete();
        target.create();
        await target.write(baked.bytes);
      }
      written.push({ file: name, label: s.label, sig });
      await writeJson(next, PROGRESS, { stickers: written });
    }
    onProgress(i + 1, stickers.length);
  }
  // The whole pack is made: name it, keep only its files, and swap it in.
  const order = new Map(stickers.map((s, i) => [`${s.stem}.png`, i]));
  const manifest: MessagesManifest = {
    stickers: written
      .filter((e) => order.has(e.file))
      .sort((a, b) => (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0)),
  };
  await writeJson(next, MANIFEST, manifest);
  const keep = new Set([MANIFEST, ...manifest.stickers.map((e) => e.file)]);
  for (const entry of next.list())
    if (entry instanceof File && !keep.has(entry.name)) entry.delete();
  if (live.exists) live.delete();
  next.rename(STICKERS_FOLDER.replace(/^surfaces\/|\/$/g, ''));
  return 'written';
}
