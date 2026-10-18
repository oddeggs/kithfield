import type { PackSticker } from './pack';

/** What one sticker's file depends on: how files are made and the sticker as drawn. */
export function stickerSignature(sticker: PackSticker, format: string): string {
  return JSON.stringify([format, sticker.stem, sticker.attrs]);
}

/** Which stickers of a pack are already made as they are drawn now, and which to make. */
export function bakePlan(
  stickers: readonly PackSticker[],
  done: Readonly<Record<string, string>>,
  format: string,
): { readonly reuse: PackSticker[]; readonly make: PackSticker[] } {
  const reuse: PackSticker[] = [];
  const make: PackSticker[] = [];
  for (const s of stickers) {
    (done[s.stem] === stickerSignature(s, format) ? reuse : make).push(s);
  }
  return { reuse, make };
}
