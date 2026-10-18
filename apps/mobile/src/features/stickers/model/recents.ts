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
