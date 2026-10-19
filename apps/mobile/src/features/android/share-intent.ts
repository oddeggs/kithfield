import {
  APP_GROUP_PATHS,
  HttpUrl,
  LIMITS,
  ShareDraft,
  type FarmList,
  type OpId,
} from '@kithfield/contracts';
import { File } from 'expo-file-system';

import {
  androidSystem,
  type SharedIntent,
  type SharedIntentFile,
} from '../../../modules/android-system';
import type { GroupStore } from '../surfaces/group-store';

/*
 * Something shared into Kithfield from another app's share sheet (text, a link, photos): Android
 * hands it to the app itself, so the app asks which farm in a list and leaves a `ShareDraft` in
 * the same outbox the iOS share extension writes, which the surfaces then send and open.
 */

export interface ShareIntentDeps {
  readonly farms: () => Promise<FarmList['farms']>;
  readonly group: GroupStore;
  /** Asks which farm, by name; the index chosen, or null when the person cancelled. */
  readonly choose: (names: readonly string[]) => Promise<number | null>;
  readonly newOpId: () => OpId;
  readonly now: () => number;
}

const URL_ONLY = /^https?:\/\/\S+$/;
const MIME = /^[a-z]+\/[a-z0-9.+-]{1,80}$/;

/** Words cut to the message limit, never halfway through a character. */
export function limitedText(words: string): string {
  if (words.length <= LIMITS.message) return words;
  const cut = words.slice(0, LIMITS.message);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * The shared files a draft can carry: another app says what each is, so an empty file, one past
 * the upload limit, or one beyond the share's count is left out rather than losing the share.
 */
export function keptFiles(files: readonly SharedIntentFile[]): SharedIntentFile[] {
  return files
    .filter((f) => f.bytes >= 1 && f.bytes <= LIMITS.uploadBytes)
    .slice(0, LIMITS.mediaItems);
}

/** The file's type as the draft writes it; one another app named oddly is just bytes. */
const mimeOf = (f: SharedIntentFile) => {
  const mime = f.mime.toLowerCase();
  return MIME.test(mime) ? mime : 'application/octet-stream';
};

/** A file name's extension, letters and digits only, as the outbox names its files. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot < 0 ? '' : name.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '');
  return ext === '' ? 'bin' : ext.slice(0, 8).toLowerCase();
}

/** A farm's name as the list shows it: its own, or the friend's on a visit. */
const nameOf = (row: FarmList['farms'][number]) => row.name ?? row.with?.name ?? '';

/** The draft for a share sent to `farm`, its files already in the outbox. */
export function draftFor(
  share: SharedIntent,
  farm: string,
  opId: OpId,
  at: number,
  files: ShareDraft['files'],
): ShareDraft | null {
  const words = share.text?.trim() ?? '';
  const url = URL_ONLY.test(words) && HttpUrl.safeParse(words).success ? words : undefined;
  const text = url === undefined && words !== '' ? limitedText(words) : undefined;
  const parsed = ShareDraft.safeParse({
    opId,
    farm,
    at,
    ...(text !== undefined ? { text } : {}),
    ...(url !== undefined ? { url } : {}),
    files,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Moves a shared file from the cache into the outbox, on disk: a share can be ten photos of up to
 * 100 MB each, which never pass through JavaScript's memory. The draft is written after its files,
 * so the outbox never sees a draft whose files are still arriving.
 */
async function moveInto(group: GroupStore, path: string, from: string): Promise<void> {
  const target = new File(group.uri(path));
  const folder = target.parentDirectory;
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  await new File(from).move(target, { overwrite: true });
}

/**
 * Takes what was shared, if anything: asks which farm and leaves the draft. True when a draft is
 * waiting for the surfaces to send.
 */
export async function takeShareIntent(deps: ShareIntentDeps): Promise<boolean> {
  const share = androidSystem?.takeShare() ?? null;
  if (share === null) return false;
  const discard = () => {
    for (const f of share.files) {
      const file = new File(f.uri);
      if (file.exists) file.delete();
    }
  };
  const farms = await deps.farms();
  const picked = farms.length === 0 ? null : await deps.choose(farms.map(nameOf));
  const row = picked === null ? undefined : farms[picked];
  if (row === undefined) {
    discard();
    return false;
  }
  const opId = deps.newOpId();
  const files: ShareDraft['files'][number][] = [];
  for (const [i, f] of keptFiles(share.files).entries()) {
    const path = `${APP_GROUP_PATHS.shareOutbox}${opId}-${i}.${extensionOf(f.name)}`;
    await moveInto(deps.group, path, f.uri);
    files.push({ path, mime: mimeOf(f), bytes: f.bytes });
  }
  discard();
  const draft = draftFor(share, row.farm, opId, deps.now(), files);
  if (draft === null) {
    for (const f of files) deps.group.delete(f.path);
    return false;
  }
  await deps.group.write(`${APP_GROUP_PATHS.shareOutbox}${opId}.json`, JSON.stringify(draft));
  return true;
}
