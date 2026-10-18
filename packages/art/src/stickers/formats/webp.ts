import {
  concat,
  fourcc,
  fourccAt,
  putU16le,
  putU24le,
  putU32le,
  u16le,
  u24le,
  u32le,
} from './bytes';

/*
 * Animated WebP, the format WhatsApp stickers use. Frames arrive as still WebPs (lossy with an
 * alpha chunk, or lossless), each the whole canvas or only the rectangle that changed, and are
 * wrapped as `ANMF` frames without re-encoding.
 */

interface RiffChunk {
  readonly type: string;
  /** The payload, without its header or padding. */
  readonly data: Uint8Array;
}

function readRiff(bytes: Uint8Array): RiffChunk[] {
  if (bytes.length < 12 || fourccAt(bytes, 0) !== 'RIFF' || fourccAt(bytes, 8) !== 'WEBP') {
    throw new Error('Not a WebP');
  }
  const end = Math.min(bytes.length, 8 + u32le(bytes, 4));
  return readChunkList(bytes, 12, end);
}

function readChunkList(bytes: Uint8Array, start: number, end: number): RiffChunk[] {
  const chunks: RiffChunk[] = [];
  let i = start;
  while (i + 8 <= end) {
    const type = fourccAt(bytes, i);
    const size = u32le(bytes, i + 4);
    if (i + 8 + size > end) throw new Error(`WebP chunk ${type} runs past the end`);
    chunks.push({ type, data: bytes.subarray(i + 8, i + 8 + size) });
    i += 8 + size + (size & 1);
  }
  return chunks;
}

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const pad = data.length & 1;
  const out = new Uint8Array(8 + data.length + pad);
  out.set(fourcc(type), 0);
  putU32le(out, 4, data.length);
  out.set(data, 8);
  return out;
}

function riff(chunks: readonly Uint8Array[]): Uint8Array {
  const body = concat(chunks);
  const head = new Uint8Array(12);
  head.set(fourcc('RIFF'), 0);
  putU32le(head, 4, 4 + body.length);
  head.set(fourcc('WEBP'), 8);
  return concat([head, body]);
}

/** The size a VP8 or VP8L bitstream codes. */
function bitstreamSize(chunk: RiffChunk): { width: number; height: number; alpha: boolean } {
  const d = chunk.data;
  if (chunk.type === 'VP8 ') {
    if (d[3] !== 0x9d || d[4] !== 0x01 || d[5] !== 0x2a) throw new Error('Bad VP8 frame header');
    return { width: u16le(d, 6) & 0x3fff, height: u16le(d, 8) & 0x3fff, alpha: false };
  }
  if (chunk.type === 'VP8L') {
    if (d[0] !== 0x2f) throw new Error('Bad VP8L signature');
    const bits = u32le(d, 1);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      alpha: ((bits >>> 28) & 1) === 1,
    };
  }
  throw new Error(`Not an image bitstream: ${chunk.type}`);
}

/** The image chunks of a still WebP (ALPH and VP8, or VP8L) and their size. */
function stillImage(bytes: Uint8Array): {
  chunks: RiffChunk[];
  width: number;
  height: number;
  alpha: boolean;
} {
  const all = readRiff(bytes);
  if (all.some((c) => c.type === 'ANIM' || c.type === 'ANMF')) {
    throw new Error('A frame must be a still WebP');
  }
  const image = all.find((c) => c.type === 'VP8 ' || c.type === 'VP8L');
  if (!image) throw new Error('WebP without an image');
  const alph = all.find((c) => c.type === 'ALPH');
  const size = bitstreamSize(image);
  return {
    chunks: alph && image.type === 'VP8 ' ? [alph, image] : [image],
    width: size.width,
    height: size.height,
    alpha: size.alpha || alph !== undefined,
  };
}

export interface WebpFrame {
  /** A still WebP holding this frame's pixels (the whole canvas, or a rectangle of it). */
  readonly webp: Uint8Array;
  /** Where the rectangle sits; both must be even. */
  readonly x: number;
  readonly y: number;
  readonly durationMs: number;
}

export interface WebpOptions {
  readonly width: number;
  readonly height: number;
  /** 0 plays forever. */
  readonly loops: number;
  /** ARGB, as a hint for players; transparent white by default. */
  readonly background?: number;
}

const FLAG_ALPHA = 0x10;
const FLAG_ANIMATION = 0x02;
/** ANMF flags: bit 1 says "don't blend" (the frame replaces what is under it). */
const ANMF_NO_BLEND = 0x02;

/** Wraps still WebPs into one animated WebP. */
export function assembleAnimatedWebp(
  options: WebpOptions,
  frames: readonly WebpFrame[],
): Uint8Array {
  if (frames.length === 0) throw new Error('An animated WebP needs at least one frame');
  const vp8x = new Uint8Array(10);
  vp8x[0] = FLAG_ALPHA | FLAG_ANIMATION;
  putU24le(vp8x, 4, options.width - 1);
  putU24le(vp8x, 7, options.height - 1);

  const anim = new Uint8Array(6);
  const bg = options.background ?? 0x00ffffff;
  // Stored as blue, green, red, alpha.
  anim[0] = bg & 0xff;
  anim[1] = (bg >>> 8) & 0xff;
  anim[2] = (bg >>> 16) & 0xff;
  anim[3] = (bg >>> 24) & 0xff;
  putU16le(anim, 4, options.loops);

  const out: Uint8Array[] = [writeChunk('VP8X', vp8x), writeChunk('ANIM', anim)];
  frames.forEach((frame, index) => {
    const still = stillImage(frame.webp);
    if (frame.x % 2 || frame.y % 2) throw new Error(`Frame ${index} sits at an odd offset`);
    if (frame.x + still.width > options.width || frame.y + still.height > options.height) {
      throw new Error(`Frame ${index} falls outside the canvas`);
    }
    const head = new Uint8Array(16);
    putU24le(head, 0, frame.x / 2);
    putU24le(head, 3, frame.y / 2);
    putU24le(head, 6, still.width - 1);
    putU24le(head, 9, still.height - 1);
    putU24le(head, 12, Math.max(0, Math.min(0xffffff, Math.round(frame.durationMs))));
    head[15] = ANMF_NO_BLEND;
    out.push(
      writeChunk('ANMF', concat([head, ...still.chunks.map((c) => writeChunk(c.type, c.data))])),
    );
  });
  return riff(out);
}

export interface WebpInfo {
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
  readonly hasAlpha: boolean;
  /** 0 plays forever. */
  readonly loops: number;
  readonly frames: readonly { x: number; y: number; w: number; h: number; durationMs: number }[];
  readonly byteLength: number;
}

/** What a WebP (still or animated) holds, checking that every frame fits its canvas. */
export function readWebp(bytes: Uint8Array): WebpInfo {
  const chunks = readRiff(bytes);
  const first = chunks[0];
  if (!first) throw new Error('Empty WebP');
  if (first.type !== 'VP8X') {
    const size = bitstreamSize(first);
    return {
      width: size.width,
      height: size.height,
      animated: false,
      hasAlpha: size.alpha,
      loops: 0,
      frames: [{ x: 0, y: 0, w: size.width, h: size.height, durationMs: 0 }],
      byteLength: bytes.length,
    };
  }
  const flags = first.data[0] ?? 0;
  const width = u24le(first.data, 4) + 1;
  const height = u24le(first.data, 7) + 1;
  const animated = (flags & FLAG_ANIMATION) !== 0;
  let hasAlpha = (flags & FLAG_ALPHA) !== 0;
  if (!animated) {
    const image = chunks.find((c) => c.type === 'VP8 ' || c.type === 'VP8L');
    if (!image) throw new Error('WebP without an image');
    return {
      width,
      height,
      animated,
      hasAlpha,
      loops: 0,
      frames: [{ x: 0, y: 0, w: width, h: height, durationMs: 0 }],
      byteLength: bytes.length,
    };
  }
  const anim = chunks.find((c) => c.type === 'ANIM');
  if (!anim) throw new Error('Animated WebP without ANIM');
  const frames = chunks
    .filter((c) => c.type === 'ANMF')
    .map((c) => {
      const d = c.data;
      const frame = {
        x: u24le(d, 0) * 2,
        y: u24le(d, 3) * 2,
        w: u24le(d, 6) + 1,
        h: u24le(d, 9) + 1,
        durationMs: u24le(d, 12),
      };
      const inner = readChunkList(d, 16, d.length);
      const image = inner.find((x) => x.type === 'VP8 ' || x.type === 'VP8L');
      if (!image) throw new Error('ANMF frame without an image');
      const size = bitstreamSize(image);
      if (size.width !== frame.w || size.height !== frame.h) {
        throw new Error('An ANMF frame and its image disagree on size');
      }
      if (frame.x + frame.w > width || frame.y + frame.h > height) {
        throw new Error('A WebP frame falls outside the canvas');
      }
      if (size.alpha || inner.some((x) => x.type === 'ALPH')) hasAlpha = true;
      return frame;
    });
  return {
    width,
    height,
    animated,
    hasAlpha,
    loops: u16le(anim.data, 4),
    frames,
    byteLength: bytes.length,
  };
}
