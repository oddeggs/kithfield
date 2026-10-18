import type { Art } from '@kithfield/art';
import { Directory, File, Paths } from 'expo-file-system';
import { Linking } from 'react-native';

import { surfaces } from '../../../../modules/surfaces';
import {
  checkWhatsAppPack,
  checkWhatsAppSticker,
  checkWhatsAppTray,
  WHATSAPP,
} from '../formats/specs';
import { toBase64, utf8 } from './base64';
import { bakeStill, bakeSticker, type BakeSpec } from './bake';
import { packSignature, type PackSticker } from './pack';

/*
 * WhatsApp takes a pack through the pasteboard: one JSON item of its own type holding every
 * sticker (animated WebP, 512 px, at most 500 KB each) and a 96 px tray icon, then its
 * `stickerPack` link asks the person to confirm. A pack holds 3 to 30 stickers.
 */

/**
 * WhatsApp's 500 KB holds most stickers at 15 frames a second; the busiest drop to 10, and the
 * busiest of all to 6 (Skia keeps a sticker's soft edges exact, so its WebPs run larger).
 */
export const WHATSAPP_SPEC: BakeSpec = {
  size: 512,
  fps: [15, 10, 6],
  format: 'webp',
  maxBytes: WHATSAPP.animatedBytes,
  qualities: [70, 50, 35, 25],
};
const TRAY = 96;
/** Bumped when the way the pack's files are made changes, so cached ones are made again. */
const CACHE_VERSION = 'webp-2';
const PASTEBOARD_TYPE = 'net.whatsapp.third-party.sticker-pack';
/** How long the pack stays on the pasteboard for WhatsApp to read it. */
const PASTEBOARD_SECONDS = 60;
const OPEN_URL = 'whatsapp://stickerPack';

/** The emoji WhatsApp files each sticker under (it asks for at least one). */
const EMOJI: Readonly<Record<string, string>> = {
  wave: '👋',
  hug: '🤗',
  love: '❤️',
  laugh: '😂',
  sleepy: '😴',
  thanks: '🙏',
  omw: '🏃',
  yay: '🎉',
  care: '🫂',
  peek: '👀',
  heart_eyes: '😍',
  im_in: '🙋',
  tumble: '💨',
  swing: '🌳',
  duvet: '🛌',
  star_eyes: '🤩',
  balloon: '🎈',
  miss: '🥺',
  nope: '🙅',
  face: '🙂',
  in: '✋',
  saw: '👁️',
  kite: '🪁',
  mail: '📬',
};

export interface WhatsAppPack {
  /** The pasteboard item's JSON, as WhatsApp reads it. */
  readonly json: string;
  readonly stickers: number;
}

/** Whether WhatsApp is on this phone (its scheme is declared, so iOS answers truthfully). */
export async function whatsappInstalled(): Promise<boolean> {
  try {
    return await Linking.canOpenURL('whatsapp://');
  } catch {
    return false;
  }
}

/**
 * Bakes the pack WhatsApp takes, or reads it from the cache when the pack is drawn the same as
 * last time. Null when cancelled.
 */
export async function bakeWhatsAppPack(
  art: Art,
  pack: {
    readonly identifier: string;
    readonly name: string;
    readonly stickers: readonly PackSticker[];
    readonly tray: Readonly<Record<string, string>>;
  },
  onProgress: (done: number, total: number) => void = () => undefined,
  cancelled: () => boolean = () => false,
): Promise<WhatsAppPack | null> {
  const stickers = pack.stickers.slice(0, 30);
  if (checkWhatsAppPack(stickers.length).length > 0)
    throw new Error('A WhatsApp pack holds 3 to 30');
  const folder = new Directory(Paths.cache, 'stickers-whatsapp');
  const signature = `${CACHE_VERSION}:${packSignature(stickers, 'webp')}`;
  const marker = new File(folder, 'signature.txt');
  const cached = folder.exists && marker.exists && (await marker.text()) === signature;
  if (!cached) {
    if (folder.exists) folder.delete();
    folder.create({ intermediates: true });
  }
  const keep = async (name: string, make: () => Promise<Uint8Array | null> | Uint8Array) => {
    const file = new File(folder, name);
    if (cached && file.exists) return file.bytes();
    const bytes = await make();
    if (bytes === null) return null;
    if (file.exists) file.delete();
    file.create();
    await file.write(bytes);
    return bytes;
  };
  const tray = await keep('tray.png', () => bakeStill(art, pack.tray, TRAY));
  if (tray === null) return null;
  if (__DEV__ && checkWhatsAppTray(tray).length > 0)
    console.warn('Tray icon', checkWhatsAppTray(tray));
  const baked: { image_data: string; emojis: string[] }[] = [];
  onProgress(0, stickers.length);
  for (const [i, s] of stickers.entries()) {
    const bytes = await keep(`${s.stem}.webp`, () =>
      bakeSticker(art, s.attrs, WHATSAPP_SPEC, cancelled),
    );
    if (bytes === null) return null;
    if (__DEV__ && checkWhatsAppSticker(bytes).length > 0) {
      console.warn(`The ${s.id} sticker is over what WhatsApp takes`, checkWhatsAppSticker(bytes));
    }
    baked.push({ image_data: toBase64(bytes), emojis: [EMOJI[s.id] ?? '🙂'] });
    onProgress(i + 1, stickers.length);
  }
  if (!cached) {
    if (!marker.exists) marker.create();
    await marker.write(signature);
  }
  const json = JSON.stringify({
    identifier: pack.identifier,
    name: pack.name,
    publisher: 'Kithfield',
    tray_image: toBase64(tray),
    publisher_website: 'https://kithfield.com',
    privacy_policy_website: 'https://kithfield.com/privacy',
    license_agreement_website: 'https://kithfield.com/terms',
    animated_sticker_pack: true,
    stickers: baked,
  });
  return { json, stickers: baked.length };
}

/** Hands the pack to WhatsApp, which asks the person to add it. False when it can't open. */
export async function openInWhatsApp(pack: WhatsAppPack): Promise<boolean> {
  if (surfaces === null) return false;
  await surfaces.copyToPasteboard(PASTEBOARD_TYPE, toBase64(utf8(pack.json)), PASTEBOARD_SECONDS);
  try {
    await Linking.openURL(OPEN_URL);
    return true;
  } catch {
    return false;
  }
}
