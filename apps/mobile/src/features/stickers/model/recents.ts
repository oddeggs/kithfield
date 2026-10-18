/** A sticker sent recently, as it travels. */
export interface RecentSticker {
  readonly pack: string;
  readonly sticker: string;
  readonly with?: readonly string[];
}

/** The picker's recent row holds this many. */
export const RECENT_MAX = 8;

/** Puts a sent sticker first, once, and keeps the newest `RECENT_MAX`. */
export function pushRecent(list: readonly RecentSticker[], sent: RecentSticker): RecentSticker[] {
  const key = (r: RecentSticker) => `${r.pack}/${r.sticker}/${(r.with ?? []).join(',')}`;
  return [sent, ...list.filter((r) => key(r) !== key(sent))].slice(0, RECENT_MAX);
}

/**
 * The recent row as this farm can send it now: a together sticker stays only while everyone in it
 * can still be drawn (nobody blocked, removed or turned it off since), and none shows until the
 * farm has said who can be.
 */
export function usableRecents(
  recents: readonly RecentSticker[],
  drawable: ReadonlySet<string> | null,
): RecentSticker[] {
  return recents.filter(
    (r) =>
      !r.with || r.with.length === 0 || (drawable !== null && r.with.every((p) => drawable.has(p))),
  );
}
