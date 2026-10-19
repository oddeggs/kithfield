import { WHATSAPP } from '@kithfield/art/stickers';

/** A sticker made for WhatsApp, and whether it came in under its limit. */
export interface MadeSticker {
  readonly id: string;
  readonly bytes: Uint8Array;
  readonly fits: boolean;
}

/**
 * The stickers a WhatsApp pack holds: those under the limit, at most thirty, naming any left
 * out. Fewer than three can't make a pack.
 */
export function fitPack(
  made: readonly MadeSticker[],
):
  | { readonly ok: true; readonly kept: MadeSticker[]; readonly dropped: string[] }
  | { readonly ok: false } {
  const kept = made.filter((m) => m.fits).slice(0, WHATSAPP.maxStickers);
  const dropped = made.filter((m) => !m.fits).map((m) => m.id);
  return kept.length < WHATSAPP.minStickers ? { ok: false } : { ok: true, kept, dropped };
}

/**
 * The pack's identifier in WhatsApp: made once at random and kept on this phone, so a new pack
 * replaces the old one in WhatsApp without telling it who anyone is.
 */
export function packIdentifier(
  store: { read(): string | null; write(id: string): void },
  random: () => string,
): string {
  const held = store.read();
  if (held) return held;
  const id = `kithfield_${random().replace(/[^A-Za-z0-9_.-]/g, '')}`.slice(0, 128);
  store.write(id);
  return id;
}
