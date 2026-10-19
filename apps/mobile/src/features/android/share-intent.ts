import {
  APP_GROUP_PATHS,
  LIMITS,
  ShareDraft,
  type FarmList,
  type OpId,
} from '@kithfield/contracts';
import { File } from 'expo-file-system';

import { androidSystem, type SharedIntent } from '../../../modules/android-system';
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
  const url = URL_ONLY.test(words) ? words : undefined;
  const text = url === undefined && words !== '' ? words.slice(0, LIMITS.message) : undefined;
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
  for (const [i, f] of share.files.slice(0, LIMITS.mediaItems).entries()) {
    const ext = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.') + 1) : 'bin';
    const path = `${APP_GROUP_PATHS.shareOutbox}${opId}-${i}.${ext.replace(/[^A-Za-z0-9]/g, '')}`;
    await deps.group.write(path, new File(f.uri).bytesSync());
    files.push({ path, mime: f.mime.toLowerCase(), bytes: f.bytes });
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
