import type { ChatListItem } from '@kithfield/contracts';

/** A banner owed on the desktop, before names are looked up: who, where, and the words' key. */
export interface SoftNote {
  readonly farm: string;
  readonly seq: number;
  readonly actor: string;
  /** The farm's name, or null for a visit (titled with the app's name). */
  readonly farmName: string | null;
  /** The friend's name when the row carries it (a visit's peer). */
  readonly knownName: string | null;
  /** The copy key from the notification catalogue, and the message's own line for a mention. */
  readonly body: string;
  readonly preview: string | null;
}

/** The kinds that make a banner on the desktop: things on your step, a knock, words to you. */
const BANNER_KINDS: Readonly<Record<string, string>> = {
  firefly: 'push.doorstep.firefly',
  gift: 'push.doorstep.gift',
  slow_post: 'push.doorstep.slowPost',
  knock: 'push.knock',
  message: 'push.mention',
};

/**
 * The banners owed for a new chat list: one for each row that moved on to something meant for
 * you (`forYou`: your step, a knock, a mention or a reply), never for a muted farm, your own
 * doing, or anything already there when the list was first read. Banners are soft: the caller
 * shows them without sound. `seen` maps each farm to the newest seq already considered, and is
 * updated.
 */
export function softNotes(
  rows: readonly ChatListItem[],
  seen: Map<string, number>,
  me: string | null,
): SoftNote[] {
  const notes: SoftNote[] = [];
  for (const row of rows) {
    const before = seen.get(row.farm);
    seen.set(row.farm, Math.max(before ?? 0, row.seq));
    // The first sight of a row only marks where it is.
    if (before === undefined || row.seq <= before) continue;
    if (!row.forYou || row.muted || row.actor === null || row.actor === me) continue;
    const body = BANNER_KINDS[row.kind];
    if (!body) continue;
    notes.push({
      farm: row.farm,
      seq: row.seq,
      actor: row.actor,
      farmName: row.farmKind === 'farm' ? row.name : null,
      knownName: row.with?.person === row.actor ? row.with.name : null,
      body,
      preview: row.kind === 'message' ? (row.preview ?? '') : null,
    });
  }
  return notes;
}
