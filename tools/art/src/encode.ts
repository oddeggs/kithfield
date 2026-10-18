import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { deflateSync, inflateSync } from 'node:zlib';

import sharp from 'sharp';

import { assembleApng } from '../../../apps/mobile/src/features/stickers/formats/apng';
import {
  changedRect,
  cropRgba,
  type Rect,
} from '../../../apps/mobile/src/features/stickers/formats/delta';
import {
  headerOf,
  readChunks,
  writePng,
} from '../../../apps/mobile/src/features/stickers/formats/png';
import {
  MESSAGES,
  TELEGRAM,
  WHATSAPP,
} from '../../../apps/mobile/src/features/stickers/formats/specs';
import { assembleAnimatedWebp } from '../../../apps/mobile/src/features/stickers/formats/webp';
import type { Frame, Loop } from './render';

const run = promisify(execFile);

/** Integer frame durations whose sum is exact: 33, 34, 33… at 30 fps. */
export function durations(count: number, fps: number): number[] {
  return Array.from(
    { length: count },
    (_, i) => Math.round(((i + 1) * 1000) / fps) - Math.round((i * 1000) / fps),
  );
}

/** Every `step`th frame: the same loop at a lower rate. */
export function everyNth(loop: Loop, step: number): Loop {
  return { frames: loop.frames.filter((_, i) => i % step === 0), fps: loop.fps / step };
}

function raw(rgba: Uint8Array, width: number, height: number) {
  return sharp(Buffer.from(rgba), { raw: { width, height, channels: 4, premultiplied: true } });
}

/** A loop scaled to `size` square (premultiplied RGBA in, premultiplied RGBA out). */
export async function scaleLoop(loop: Loop, size: number): Promise<Loop> {
  const frames = await Promise.all(
    loop.frames.map(async (f) => {
      if (f.width === size) return f;
      const { data } = await raw(f.rgba, f.width, f.height)
        .resize(size, size, { kernel: 'lanczos3' })
        .raw({ depth: 'uchar' })
        .toBuffer({ resolveWithObject: true });
      // Sharp hands back straight alpha; premultiply again so frames compare as drawn.
      const out = new Uint8Array(data);
      for (let i = 0; i < out.length; i += 4) {
        const a = out[i + 3] ?? 0;
        out[i] = Math.round(((out[i] ?? 0) * a) / 255);
        out[i + 1] = Math.round(((out[i + 1] ?? 0) * a) / 255);
        out[i + 2] = Math.round(((out[i + 2] ?? 0) * a) / 255);
      }
      return { rgba: out, width: size, height: size };
    }),
  );
  return { frames, fps: loop.fps };
}

interface Piece {
  readonly rect: Rect;
  readonly durationMs: number;
}

/**
 * The frames as rectangles that changed, each with how long it shows: a frame the same as the one
 * before only lengthens it.
 */
function pieces(loop: Loop, align: number): { frame: Frame; piece: Piece }[] {
  const times = durations(loop.frames.length, loop.fps);
  const out: { frame: Frame; piece: Piece }[] = [];
  let prev: Frame | null = null;
  loop.frames.forEach((frame, i) => {
    const ms = times[i] ?? 0;
    const rect = prev
      ? changedRect(prev.rgba, frame.rgba, frame.width, frame.height, align)
      : { x: 0, y: 0, w: frame.width, h: frame.height };
    const last = out[out.length - 1];
    if (!rect && last) {
      out[out.length - 1] = {
        ...last,
        piece: { ...last.piece, durationMs: last.piece.durationMs + ms },
      };
    } else if (rect) {
      out.push({ frame, piece: { rect, durationMs: ms } });
    }
    prev = frame;
  });
  return out;
}

export interface WebpSettings {
  readonly quality: number;
  readonly alphaQuality: number;
}

/** An animated WebP for WhatsApp: lossy frames with alpha, each only what changed. */
export async function encodeWebp(loop: Loop, settings: WebpSettings): Promise<Uint8Array> {
  const size = loop.frames[0]?.width ?? 0;
  const parts = await Promise.all(
    pieces(loop, 2).map(async ({ frame, piece }) => {
      const crop = cropRgba(frame.rgba, frame.width, piece.rect);
      const webp = await raw(crop, piece.rect.w, piece.rect.h)
        .webp({
          quality: settings.quality,
          alphaQuality: settings.alphaQuality,
          effort: 6,
          smartSubsample: true,
        })
        .toBuffer();
      return {
        webp: new Uint8Array(webp),
        x: piece.rect.x,
        y: piece.rect.y,
        durationMs: piece.durationMs,
      };
    }),
  );
  return assembleAnimatedWebp({ width: size, height: size, loops: 0 }, parts);
}

/** A still PNG (straight alpha) of one frame, for trays, icons and ffmpeg. */
export async function encodePng(frame: Frame, size = frame.width): Promise<Uint8Array> {
  let image = raw(frame.rgba, frame.width, frame.height);
  if (size !== frame.width) image = image.resize(size, size, { kernel: 'lanczos3' });
  return new Uint8Array(await image.png({ compressionLevel: 9, palette: size <= 128 }).toBuffer());
}

/** Frame steps tried in turn when a loop doesn't fit: 30, then 15, then 10 frames a second. */
const STEPS = [1, 2, 3] as const;

/** The first rate and setting whose animated WebP fits WhatsApp's size limit. */
export async function fitWebp(
  loop: Loop,
  tries: readonly WebpSettings[],
): Promise<{ bytes: Uint8Array; settings: WebpSettings; fps: number }> {
  let last: { bytes: Uint8Array; settings: WebpSettings; fps: number } | null = null;
  for (const step of STEPS) {
    const l = step === 1 ? loop : everyNth(loop, step);
    for (const settings of tries) {
      const bytes = await encodeWebp(l, settings);
      last = { bytes, settings, fps: l.fps };
      if (bytes.length <= WHATSAPP.animatedBytes) return last;
    }
  }
  if (!last) throw new Error('No frames');
  return last;
}

/* Telegram: VP9 WebM through ffmpeg */

export function ffmpegPath(): string {
  return process.env['FFMPEG'] ?? 'ffmpeg';
}

export async function checkFfmpeg(): Promise<void> {
  try {
    const { stdout } = await run(ffmpegPath(), ['-hide_banner', '-encoders']);
    if (!stdout.includes('libvpx-vp9')) throw new Error('this ffmpeg has no libvpx-vp9 encoder');
  } catch (error) {
    throw new Error(
      `Telegram stickers need ffmpeg with libvpx-vp9 (set FFMPEG or put ffmpeg on PATH; on a Mac, ` +
        `brew install ffmpeg): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** A VP9 WebM with alpha from the loop's frames, as small as `maxBytes` allows. */
export async function encodeWebm(
  loop: Loop,
  size: number,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; crf: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'kf-webm-'));
  try {
    await Promise.all(
      loop.frames.map(async (f, i) =>
        writeFileSync(join(dir, `${String(i).padStart(3, '0')}.png`), await encodePng(f, size)),
      ),
    );
    let best: { bytes: Uint8Array; crf: number } | null = null;
    for (const crf of [30, 36, 42, 48, 54, 60]) {
      const out = join(dir, `out-${crf}.webm`);
      await run(ffmpegPath(), [
        '-v',
        'error',
        '-y',
        '-framerate',
        String(loop.fps),
        '-i',
        join(dir, '%03d.png'),
        '-c:v',
        'libvpx-vp9',
        '-pix_fmt',
        'yuva420p',
        '-crf',
        String(crf),
        '-b:v',
        '0',
        '-deadline',
        'good',
        '-row-mt',
        '1',
        '-an',
        '-t',
        String(TELEGRAM.maxDurationMs / 1000),
        out,
      ]);
      best = { bytes: new Uint8Array(readFileSync(out)), crf };
      if (best.bytes.length <= maxBytes) return best;
    }
    if (!best) throw new Error('ffmpeg wrote nothing');
    return best;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* Messages: APNG with one shared palette */

const PNG_PALETTE = 3;

/** Undoes PNG row filters for 1-byte pixels. */
function unfilter(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  let i = 0;
  for (let y = 0; y < height; y++) {
    const filter = data[i++] ?? 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const raw = data[i++] ?? 0;
      const a = x > 0 ? (out[row + x - 1] ?? 0) : 0;
      const b = y > 0 ? (out[row - width + x] ?? 0) : 0;
      const c = x > 0 && y > 0 ? (out[row - width + x - 1] ?? 0) : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = raw;
          break;
        case 1:
          v = raw + a;
          break;
        case 2:
          v = raw + b;
          break;
        case 3:
          v = raw + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a),
            pb = Math.abs(p - b),
            pc = Math.abs(p - c);
          v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`Unknown PNG filter ${filter}`);
      }
      out[row + x] = v & 0xff;
    }
  }
  return out;
}

/** Palette indices of a rectangle as PNG image data (Sub filter, which suits flat art). */
function indexedData(indices: Uint8Array, width: number, rect: Rect): Uint8Array {
  const out = new Uint8Array(rect.h * (rect.w + 1));
  let o = 0;
  for (let y = 0; y < rect.h; y++) {
    out[o++] = 1;
    const row = (rect.y + y) * width + rect.x;
    for (let x = 0; x < rect.w; x++) {
      const v = indices[row + x] ?? 0;
      const left = x > 0 ? (indices[row + x - 1] ?? 0) : 0;
      out[o++] = (v - left) & 0xff;
    }
  }
  return deflateSync(out, { level: 9 });
}

function ihdr(width: number, height: number): Uint8Array {
  const d = new Uint8Array(13);
  const v = new DataView(d.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  d[8] = 8;
  d[9] = PNG_PALETTE;
  return d;
}

/**
 * An APNG for the Messages drawer: one palette for the whole loop (at `quality`, libimagequant's
 * 0–100, which trades colours for size), then only what changed.
 */
export async function encodeApng(loop: Loop, quality = 100): Promise<Uint8Array> {
  const first = loop.frames[0];
  if (!first) throw new Error('No frames');
  const size = first.width;
  // Every frame stacked into one tall image, so a single palette serves the loop.
  const strip = await sharp({
    create: {
      width: size,
      height: size * loop.frames.length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      await Promise.all(
        loop.frames.map(async (f, i) => ({
          input: Buffer.from(await encodePng(f)),
          top: i * size,
          left: 0,
        })),
      ),
    )
    .png({ palette: true, colours: 256, quality, dither: 0, compressionLevel: 1, effort: 10 })
    .toBuffer();
  const chunks = readChunks(new Uint8Array(strip));
  const head = headerOf(chunks);
  if (head.colorType !== PNG_PALETTE || head.bitDepth !== 8) {
    throw new Error(`Expected an 8-bit palette, got type ${head.colorType} depth ${head.bitDepth}`);
  }
  const plte = chunks.find((c) => c.type === 'PLTE');
  const trns = chunks.find((c) => c.type === 'tRNS');
  if (!plte) throw new Error('Palette PNG without PLTE');
  const idat = Buffer.concat(
    chunks.filter((c) => c.type === 'IDAT').map((c) => Buffer.from(c.data)),
  );
  const all = unfilter(new Uint8Array(inflateSync(idat)), size, head.height);

  const frameIndices = loop.frames.map((_, i) =>
    all.subarray(i * size * size, (i + 1) * size * size),
  );
  const asRgbaish = (ix: Uint8Array) => {
    // changedRect compares RGBA; widen indices so it can compare them too.
    const out = new Uint8Array(ix.length * 4);
    for (let i = 0; i < ix.length; i++) out[i * 4] = ix[i] ?? 0;
    return out;
  };
  const wide = frameIndices.map(asRgbaish);
  const times = durations(loop.frames.length, loop.fps);
  const frames: { png: Uint8Array; x: number; y: number; delayMs: number }[] = [];
  wide.forEach((w, i) => {
    const prev = i > 0 ? wide[i - 1] : undefined;
    const rect = prev ? changedRect(prev, w, size, size, 1) : { x: 0, y: 0, w: size, h: size };
    const last = frames[frames.length - 1];
    const ms = times[i] ?? 0;
    if (!rect) {
      if (last) frames[frames.length - 1] = { ...last, delayMs: last.delayMs + ms };
      return;
    }
    const png = writePng([
      { type: 'IHDR', data: ihdr(rect.w, rect.h) },
      plte,
      ...(trns ? [trns] : []),
      {
        type: 'IDAT',
        data: new Uint8Array(indexedData(frameIndices[i] ?? new Uint8Array(), size, rect)),
      },
      { type: 'IEND', data: new Uint8Array(0) },
    ]);
    frames.push({ png, x: rect.x, y: rect.y, delayMs: ms });
  });
  return assembleApng({ width: size, height: size, loops: 0 }, frames);
}

/** The first rate and palette quality whose APNG fits Messages' size limit. */
export async function fitApng(
  loop: Loop,
  qualities: readonly number[],
): Promise<{ bytes: Uint8Array; fps: number; quality: number }> {
  let last: { bytes: Uint8Array; fps: number; quality: number } | null = null;
  for (const step of STEPS) {
    const l = step === 1 ? loop : everyNth(loop, step);
    for (const quality of qualities) {
      last = { bytes: await encodeApng(l, quality), fps: l.fps, quality };
      if (last.bytes.length <= MESSAGES.bytes) return last;
    }
  }
  if (!last) throw new Error('No frames');
  return last;
}
