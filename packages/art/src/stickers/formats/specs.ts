import { u16le } from './bytes';
import { readApng } from './apng';
import { isPng, pngSize } from './png';
import { readWebm } from './webm';
import { readWebp } from './webp';

/*
 * What each app accepts, as its own documentation states it. Each check answers the problems it
 * found (none means the file is fine), naming the rule it broke. These are developer checks for
 * the baker and the tests, never shown to people.
 */

export interface Problem {
  /** Which rule, as `<app>.<rule>`. */
  readonly rule: string;
  readonly message: string;
}

const KB = 1024;

/** WhatsApp's sticker rules (its sticker-pack guidelines for iOS and Android). */
export const WHATSAPP = {
  size: 512,
  animatedBytes: 500 * KB,
  staticBytes: 100 * KB,
  minFrameMs: 8,
  maxDurationMs: 10_000,
  traySize: 96,
  trayBytes: 50 * KB,
  minStickers: 3,
  maxStickers: 30,
} as const;

/** Telegram's video sticker rules (the Bot API's sticker requirements). */
export const TELEGRAM = {
  side: 512,
  maxDurationMs: 3000,
  maxFps: 30,
  bytes: 256 * KB,
  iconSide: 100,
  iconBytes: 32 * KB,
} as const;

/** Messages accepts PNG, APNG, GIF and JPEG stickers up to 500 KB, from 300 to 618 pixels. */
export const MESSAGES = { bytes: 500 * KB, min: 300, max: 618 } as const;

const problem = (rule: string, message: string): Problem => ({ rule, message });

function guarded(rule: string, check: () => Problem[]): Problem[] {
  try {
    return check();
  } catch (error) {
    return [problem(rule, error instanceof Error ? error.message : String(error))];
  }
}

const kb = (bytes: number) => `${(bytes / KB).toFixed(1)} KB`;

/** A WhatsApp sticker: a 512×512 WebP, animated or still. */
export function checkWhatsAppSticker(bytes: Uint8Array): Problem[] {
  return guarded('whatsapp.format', () => {
    const info = readWebp(bytes);
    const out: Problem[] = [];
    if (info.width !== WHATSAPP.size || info.height !== WHATSAPP.size) {
      out.push(problem('whatsapp.size', `must be 512×512, is ${info.width}×${info.height}`));
    }
    if (info.animated) {
      if (bytes.length > WHATSAPP.animatedBytes) {
        out.push(problem('whatsapp.bytes', `animated must be ≤ 500 KB, is ${kb(bytes.length)}`));
      }
      const short = info.frames.filter((f) => f.durationMs < WHATSAPP.minFrameMs);
      if (short.length > 0) {
        out.push(problem('whatsapp.frame', `every frame must last ≥ 8 ms (${short.length} don't)`));
      }
      const total = info.frames.reduce((sum, f) => sum + f.durationMs, 0);
      if (total > WHATSAPP.maxDurationMs) {
        out.push(problem('whatsapp.duration', `must play ≤ 10 s, plays ${total} ms`));
      }
    } else if (bytes.length > WHATSAPP.staticBytes) {
      out.push(problem('whatsapp.bytes', `still must be ≤ 100 KB, is ${kb(bytes.length)}`));
    }
    return out;
  });
}

/** WhatsApp's tray icon: a 96×96 PNG. */
export function checkWhatsAppTray(bytes: Uint8Array): Problem[] {
  return guarded('whatsapp.tray', () => {
    if (!isPng(bytes)) return [problem('whatsapp.tray', 'must be a PNG')];
    const { width, height } = pngSize(bytes);
    const out: Problem[] = [];
    if (width !== WHATSAPP.traySize || height !== WHATSAPP.traySize) {
      out.push(problem('whatsapp.tray', `must be 96×96, is ${width}×${height}`));
    }
    if (bytes.length > WHATSAPP.trayBytes) {
      out.push(problem('whatsapp.tray', `must be ≤ 50 KB, is ${kb(bytes.length)}`));
    }
    return out;
  });
}

/** A WhatsApp pack holds 3 to 30 stickers. */
export function checkWhatsAppPack(stickers: number): Problem[] {
  if (stickers < WHATSAPP.minStickers || stickers > WHATSAPP.maxStickers) {
    return [problem('whatsapp.pack', `a pack holds 3 to 30 stickers, this one ${stickers}`)];
  }
  return [];
}

function checkTelegramWebm(bytes: Uint8Array, icon: boolean): Problem[] {
  const rule = icon ? 'telegram.icon' : 'telegram';
  return guarded(`${rule}.format`, () => {
    const info = readWebm(bytes);
    const out: Problem[] = [];
    if (info.docType !== 'webm')
      out.push(problem(`${rule}.format`, `must be WebM, is ${info.docType}`));
    if (info.codec !== 'V_VP9') {
      out.push(problem(`${rule}.codec`, `must be VP9, is ${info.codec ?? 'no video'}`));
    }
    if (info.hasAudio) out.push(problem(`${rule}.audio`, 'must have no audio track'));
    if (icon) {
      if (info.width !== TELEGRAM.iconSide || info.height !== TELEGRAM.iconSide) {
        out.push(problem(`${rule}.size`, `must be 100×100, is ${info.width}×${info.height}`));
      }
    } else {
      const long = Math.max(info.width, info.height);
      if (long !== TELEGRAM.side) {
        out.push(problem(`${rule}.size`, `one side must be 512, is ${info.width}×${info.height}`));
      }
    }
    if (info.durationMs > TELEGRAM.maxDurationMs + 0.5) {
      out.push(
        problem(`${rule}.duration`, `must play ≤ 3 s, plays ${Math.round(info.durationMs)} ms`),
      );
    }
    if (info.fps > TELEGRAM.maxFps + 0.01) {
      out.push(problem(`${rule}.fps`, `must be ≤ 30 fps, is ${info.fps.toFixed(2)}`));
    }
    const max = icon ? TELEGRAM.iconBytes : TELEGRAM.bytes;
    if (bytes.length > max) {
      out.push(problem(`${rule}.bytes`, `must be ≤ ${max / KB} KB, is ${kb(bytes.length)}`));
    }
    return out;
  });
}

/** A Telegram video sticker: VP9 WebM, 512 on one side, up to 3 s at up to 30 fps, no sound. */
export function checkTelegramSticker(bytes: Uint8Array): Problem[] {
  return checkTelegramWebm(bytes, false);
}

/** A Telegram set's icon: a 100×100 VP9 WebM. */
export function checkTelegramIcon(bytes: Uint8Array): Problem[] {
  return checkTelegramWebm(bytes, true);
}

const isGif = (b: Uint8Array) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;

/** A Messages sticker: PNG, APNG or GIF, square, 300 to 618 pixels, up to 500 KB. */
export function checkMessagesSticker(bytes: Uint8Array): Problem[] {
  return guarded('messages.format', () => {
    let width: number;
    let height: number;
    if (isPng(bytes)) ({ width, height } = readApng(bytes));
    else if (isGif(bytes)) [width, height] = [u16le(bytes, 6), u16le(bytes, 8)];
    else return [problem('messages.format', 'must be a PNG, an APNG or a GIF')];
    const out: Problem[] = [];
    if (width !== height || width < MESSAGES.min || width > MESSAGES.max) {
      out.push(problem('messages.size', `must be square, 300 to 618 px, is ${width}×${height}`));
    }
    if (bytes.length > MESSAGES.bytes) {
      out.push(problem('messages.bytes', `must be ≤ 500 KB, is ${kb(bytes.length)}`));
    }
    return out;
  });
}
