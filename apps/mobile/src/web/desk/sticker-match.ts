/** A sticker the composer can offer, with the words written on it in the reader's language. */
export interface StickerOption {
  readonly pack: string;
  readonly sticker: string;
  readonly words: string;
}

/** At most this many suggestions, as the design's row holds them. */
export const MAX_SUGGESTIONS = 8;

/**
 * The `:word` being typed at the caret: a colon at the start or after a space, then letters
 * (any language's). Null when the caret isn't in one.
 */
export function colonQuery(
  text: string,
  caret: number,
): { readonly start: number; readonly query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s):([\p{L}\p{N}]{1,24})$/u.exec(before);
  if (!match?.[2]) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/**
 * Stickers whose words match a query: a word starting with it first, then words containing it,
 * each in the order given (your own pack first). Accents don't matter, so "chao" finds "chào".
 */
export function matchStickers(options: readonly StickerOption[], query: string): StickerOption[] {
  const q = fold(query);
  if (q === '') return [];
  const starts: StickerOption[] = [];
  const contains: StickerOption[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const key = `${option.pack}/${option.sticker}`;
    if (seen.has(key)) continue;
    const words = fold(option.words);
    if (words.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) {
      starts.push(option);
      seen.add(key);
    } else if (words.includes(q)) {
      contains.push(option);
      seen.add(key);
    }
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

/** The text once a sticker is chosen: the `:word` taken out, and the space it leaves tidied. */
export function withoutQuery(text: string, start: number, caret: number): string {
  return (text.slice(0, start) + text.slice(caret)).replace(/\s{2,}/g, ' ');
}
