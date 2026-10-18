import { APP_GROUP_PATHS, ShareDraft, type FarmId, type OpId } from '@kithfield/contracts';

import type { GroupStore } from './group-store';

/*
 * What the share extension left in the App Group: one `ShareDraft` per farm chosen, with the
 * files beside them (several drafts of one share point at the same files). The app sends each
 * through its own queues, then deletes the draft, and a file once no draft points at it.
 */

export interface PendingDraft {
  /** The draft's own file, in `APP_GROUP_PATHS.shareOutbox`. */
  readonly file: string;
  readonly draft: ShareDraft;
}

/** The drafts waiting, oldest first; a file that isn't a draft any more is dropped. */
export async function pendingDrafts(group: GroupStore): Promise<PendingDraft[]> {
  const drafts: PendingDraft[] = [];
  for (const name of group.list(APP_GROUP_PATHS.shareOutbox)) {
    if (!name.endsWith('.json')) continue;
    const file = APP_GROUP_PATHS.shareOutbox + name;
    try {
      const parsed = ShareDraft.safeParse(JSON.parse((await group.read(file)) ?? 'null'));
      if (parsed.success) drafts.push({ file, draft: parsed.data });
      else group.delete(file);
    } catch {
      group.delete(file);
    }
  }
  return drafts.sort((a, b) => a.draft.at - b.draft.at);
}

export type SharedKind = 'photo' | 'video' | 'file';

export const kindOf = (mime: string): SharedKind =>
  mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : 'file';

/** How a draft is sent: its photos and videos as one message, other files as another. */
export interface ShareSender {
  /** Photos and videos, with the words as their caption. */
  media(farm: FarmId, files: readonly SharedFile[], caption: string | undefined): Promise<void>;
  /** Other files, with the words as their caption. */
  documents(farm: FarmId, files: readonly SharedFile[], caption: string | undefined): Promise<void>;
  /** Words alone, or a link with them, under the draft's own op id. */
  words(farm: FarmId, opId: OpId, text: string | undefined, url: string | undefined): Promise<void>;
}

export interface SharedFile {
  readonly uri: string;
  readonly mime: string;
  readonly bytes: number;
  readonly name: string;
  readonly kind: SharedKind;
}

/** Sends one draft. A link with files goes in their caption, after the words. */
export async function sendDraft(group: GroupStore, draft: ShareDraft, send: ShareSender) {
  const files = draft.files
    .filter((f) => group.exists(f.path))
    .map((f) => ({
      uri: group.uri(f.path),
      mime: f.mime,
      bytes: f.bytes,
      name: f.path.slice(APP_GROUP_PATHS.shareOutbox.length),
      kind: kindOf(f.mime),
    }));
  if (files.length === 0) {
    if (draft.text === undefined && draft.url === undefined) return;
    await send.words(draft.farm, draft.opId, draft.text, draft.url);
    return;
  }
  const caption = [draft.text, draft.url].filter((s) => s !== undefined).join('\n') || undefined;
  const visual = files.filter((f) => f.kind !== 'file');
  const other = files.filter((f) => f.kind === 'file');
  if (visual.length > 0) await send.media(draft.farm, visual, caption);
  if (other.length > 0) {
    await send.documents(draft.farm, other, visual.length > 0 ? undefined : caption);
  }
}

/** Drops a sent draft, and its files unless another waiting draft points at them. */
export function finishDraft(
  group: GroupStore,
  sent: PendingDraft,
  waiting: readonly PendingDraft[],
): void {
  group.delete(sent.file);
  const kept = new Set(
    waiting.filter((p) => p.file !== sent.file).flatMap((p) => p.draft.files.map((f) => f.path)),
  );
  for (const file of sent.draft.files) {
    if (!kept.has(file.path)) group.delete(file.path);
  }
}

/** Sends every waiting draft; one that fails stays for next time. Answers the farms sent to. */
export async function drainShares(
  group: GroupStore,
  send: ShareSender,
  report: (error: unknown) => void = () => undefined,
): Promise<FarmId[]> {
  let waiting = await pendingDrafts(group);
  const sentTo: FarmId[] = [];
  for (const pending of [...waiting]) {
    try {
      await sendDraft(group, pending.draft, send);
      finishDraft(group, pending, waiting);
      waiting = waiting.filter((p) => p !== pending);
      sentTo.push(pending.draft.farm);
    } catch (error) {
      report(error);
    }
  }
  return sentTo;
}
