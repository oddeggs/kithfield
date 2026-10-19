import { LIMITS, itemProduct } from '@kithfield/contracts';
import type { PackId, TogetherDef } from '@kithfield/art/stickers';

/*
 * The sticker catalogue lives with the art (`@kithfield/art/stickers`), so the app and the baker
 * read the same packs; what ties it to the wire is here.
 */
export * from '@kithfield/art/stickers';

/** The store product that buys a pack for yourself. */
export const packProduct = (pack: PackId): string => itemProduct(pack);

/** The friends a together sticker draws, from those picked (at most `LIMITS.stickerFriends`). */
export function togetherWith<T>(def: TogetherDef, picked: readonly T[]): T[] {
  const kept = picked.slice(0, LIMITS.stickerFriends);
  if (kept.length === 0) return [];
  if (def.who === 'first') return kept.slice(0, 1);
  if (def.who === 'last') return kept.slice(-1);
  return kept;
}
