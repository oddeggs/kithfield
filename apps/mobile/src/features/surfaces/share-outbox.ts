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

/** Where a draft notes the parts already sent, so a retry never sends one twice. */
const progressOf = (draftFile: string) => draftFile.replace(/\.json$/, '.sent.json');

type Part = 'media' | 'documents' | 'words';

async function partsSent(group: GroupStore, draftFile: string): Promise<Set<Part>> {
  try {
    const raw = await group.read(progressOf(draftFile));
    return new Set(raw === null ? [] : (JSON.parse(raw) as Part[]));
  } catch {
    return new Set();
  }
}

/** The files a draft that can't be read names, inside the outbox, so they go with it. */
function filesNamedIn(raw: string | null): string[] {
  try {
    const files = (JSON.parse(raw ?? 'null') as { files?: { path?: unknown }[] } | null)?.files;
    return (files ?? [])
      .map((f) => f.path)
      .filter(
        (p): p is string => typeof p === 'string' && p.startsWith(APP_GROUP_PATHS.shareOutbox),
      )
      .filter((p) => !p.slice(APP_GROUP_PATHS.shareOutbox.length).includes('/'));
  } catch {
    return [];
  }
}

/**
 * The drafts waiting, oldest first. One the app can't send as it is (over a limit, or not a draft
 * at all) is removed with its files and counted in `refused`, so the person hears about it.
 */
export async function pendingDrafts(
  group: GroupStore,
  refused: { count: number } = { count: 0 },
): Promise<PendingDraft[]> {
  const drafts: PendingDraft[] = [];
  for (const name of group.list(APP_GROUP_PATHS.shareOutbox)) {
    if (!name.endsWith('.json') || name.endsWith('.sent.json')) continue;
    const file = APP_GROUP_PATHS.shareOutbox + name;
    const raw = await group.read(file);
    let parsed: ReturnType<typeof ShareDraft.safeParse> | null = null;
    try {
      parsed = ShareDraft.safeParse(JSON.parse(raw ?? 'null'));
    } catch {
      parsed = null;
    }
    if (parsed?.success) {
      drafts.push({ file, draft: parsed.data });
      continue;
    }
    for (const path of filesNamedIn(raw)) group.delete(path);
    group.delete(file);
    group.delete(progressOf(file));
    refused.count += 1;
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

/**
 * Sends one draft, part by part, noting each part as it goes, so a retry after a failure sends
 * only what's left. A link with files goes in their caption, after the words.
 */
export async function sendDraft(group: GroupStore, pending: PendingDraft, send: ShareSender) {
  const { draft, file } = pending;
  const done = await partsSent(group, file);
  const mark = async (part: Part) => {
    done.add(part);
    await group.write(progressOf(file), JSON.stringify([...done]));
  };
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
    if ((draft.text !== undefined || draft.url !== undefined) && !done.has('words')) {
      await send.words(draft.farm, draft.opId, draft.text, draft.url);
      await mark('words');
    }
    return;
  }
  const caption = [draft.text, draft.url].filter((s) => s !== undefined).join('\n') || undefined;
  const visual = files.filter((f) => f.kind !== 'file');
  const other = files.filter((f) => f.kind === 'file');
  if (visual.length > 0 && !done.has('media')) {
    await send.media(draft.farm, visual, caption);
    await mark('media');
  }
  if (other.length > 0 && !done.has('documents')) {
    await send.documents(draft.farm, other, visual.length > 0 ? undefined : caption);
    await mark('documents');
  }
}

/** Drops a sent draft, and its files unless another waiting draft points at them. */
export function finishDraft(
  group: GroupStore,
  sent: PendingDraft,
  waiting: readonly PendingDraft[],
): void {
  group.delete(sent.file);
  group.delete(progressOf(sent.file));
  const kept = new Set(
    waiting.filter((p) => p.file !== sent.file).flatMap((p) => p.draft.files.map((f) => f.path)),
  );
  for (const file of sent.draft.files) {
    if (!kept.has(file.path)) group.delete(file.path);
  }
}

/**
 * Sends every waiting draft; one that fails stays for next time, and `refused` hears how many
 * couldn't be sent at all. Answers the farms sent to.
 */
export async function drainShares(
  group: GroupStore,
  send: ShareSender,
  report: (error: unknown) => void = () => undefined,
  refused: (count: number) => void = () => undefined,
): Promise<FarmId[]> {
  const unreadable = { count: 0 };
  let waiting = await pendingDrafts(group, unreadable);
  if (unreadable.count > 0) refused(unreadable.count);
  const sentTo: FarmId[] = [];
  for (const pending of [...waiting]) {
    try {
      await sendDraft(group, pending, send);
      finishDraft(group, pending, waiting);
      waiting = waiting.filter((p) => p !== pending);
      sentTo.push(pending.draft.farm);
    } catch (error) {
      report(error);
    }
  }
  return sentTo;
}
