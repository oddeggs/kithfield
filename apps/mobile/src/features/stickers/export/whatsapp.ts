import type { Art } from '@kithfield/art';
import { checkWhatsAppTray, WHATSAPP } from '@kithfield/art/stickers';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Linking } from 'react-native';

import { surfaces } from '../../../../modules/surfaces';
import { personFile } from '../local-files';
import { toBase64, utf8 } from './base64';
import { bakeStill, bakeSticker, type BakeSpec } from './bake';
import type { PackSticker } from './pack';
import { stickerSignature } from './plan';
import { bakeQueue } from './queue';
import { fitPack, packIdentifier, type MadeSticker } from './whatsapp-pack';

/*
 * WhatsApp takes a pack through the pasteboard: one JSON item of its own type holding every
 * sticker (animated WebP, 512 px, at most 500 KB each) and a 96 px tray icon, then its
 * `stickerPack` link asks the person to confirm. A pack holds 3 to 30 stickers; one that can't
 * be made small enough is left out, and the pack says so.
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
const FORMAT = 'webp-3';
const PASTEBOARD_TYPE = 'net.whatsapp.third-party.sticker-pack';
/** How long the pack stays on the pasteboard for WhatsApp to read it. */
const PASTEBOARD_SECONDS = 60;
const OPEN_URL = 'whatsapp://stickerPack';
const INDEX = 'index.json';

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
  /** Stickers left out for being over WhatsApp's limit, by id. */
  readonly dropped: readonly string[];
}

export type WhatsAppBake =
  | { readonly status: 'ready'; readonly pack: WhatsAppPack }
  /** Fewer than three stickers came in under the limit. */
  | { readonly status: 'too_few' }
  | { readonly status: 'cancelled' };

/** Whether WhatsApp is on this phone (its scheme is declared, so iOS answers truthfully). */
export async function whatsappInstalled(): Promise<boolean> {
  try {
    return await Linking.canOpenURL('whatsapp://');
  } catch {
    return false;
  }
}

type Index = Record<string, { readonly sig: string; readonly fits: boolean }>;

async function readIndex(folder: Directory): Promise<Index> {
  try {
    const file = new File(folder, INDEX);
    return file.exists ? (JSON.parse(await file.text()) as Index) : {};
  } catch {
    return {};
  }
}

/** The person's pack identifier in WhatsApp, made once at random on this phone. */
function identifierFor(person: string): string {
  const file = personFile('whatsapp-id', person);
  return packIdentifier(
    {
      read: () => (file.exists ? file.textSync().trim() || null : null),
      write: (id) => {
        if (!file.exists) file.create();
        file.write(id).catch(() => undefined);
      },
    },
    randomUUID,
  );
}

/**
 * Makes the pack WhatsApp takes, through the one bake queue. Stickers already made the same way
 * are read from the cache, each by its own signature, so a bake cut short carries on.
 */
export function bakeWhatsAppPack(
  art: Art,
  pack: {
    readonly person: string;
    readonly name: string;
    readonly stickers: readonly PackSticker[];
    readonly tray: Readonly<Record<string, string>>;
  },
  onProgress: (done: number, total: number) => void = () => undefined,
  cancelled: () => boolean = () => false,
): Promise<WhatsAppBake> {
  return bakeQueue(async (): Promise<WhatsAppBake> => {
    const folder = new Directory(Paths.cache, 'stickers-whatsapp');
    if (!folder.exists) folder.create({ intermediates: true });
    const index = await readIndex(folder);
    const save = async (name: string, bytes: Uint8Array) => {
      const file = new File(folder, name);
      if (file.exists) file.delete();
      file.create();
      await file.write(bytes);
    };
    const tray = bakeStill(art, pack.tray, TRAY);
    if (__DEV__ && checkWhatsAppTray(tray).length > 0) {
      console.warn('Tray icon', checkWhatsAppTray(tray));
    }
    const made: MadeSticker[] = [];
    onProgress(0, pack.stickers.length);
    for (const [i, s] of pack.stickers.entries()) {
      const sig = stickerSignature(s, FORMAT);
      const name = `${s.stem}.webp`;
      const held = index[s.stem];
      const file = new File(folder, name);
      if (held?.sig === sig && file.exists) {
        made.push({ id: s.id, bytes: await file.bytes(), fits: held.fits });
      } else {
        const baked = await bakeSticker(art, s.attrs, WHATSAPP_SPEC, cancelled);
        if (baked === null) return { status: 'cancelled' };
        await save(name, baked.bytes);
        index[s.stem] = { sig, fits: baked.fits };
        await save(INDEX, utf8(JSON.stringify(index)));
        made.push({ id: s.id, bytes: baked.bytes, fits: baked.fits });
      }
      onProgress(i + 1, pack.stickers.length);
    }
    const fitted = fitPack(made);
    if (!fitted.ok) return { status: 'too_few' };
    const json = JSON.stringify({
      identifier: identifierFor(pack.person),
      name: pack.name,
      publisher: 'Kithfield',
      tray_image: toBase64(tray),
      publisher_website: 'https://kithfield.com',
      privacy_policy_website: 'https://kithfield.com/privacy',
      license_agreement_website: 'https://kithfield.com/terms',
      animated_sticker_pack: true,
      stickers: fitted.kept.map((m) => ({
        image_data: toBase64(m.bytes),
        emojis: [EMOJI[m.id] ?? '🙂'],
      })),
    });
    return {
      status: 'ready',
      pack: { json, stickers: fitted.kept.length, dropped: fitted.dropped },
    };
  });
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
