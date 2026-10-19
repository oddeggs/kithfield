import { concat, putU16be, putU32be, u16be, u32be } from './bytes';
import { headerOf, readChunks, writeChunk, PNG_SIGNATURE } from './png';

/*
 * Animated PNG, the format the Messages sticker drawer plays. Each frame arrives as a PNG of its
 * own (the whole sticker for the first frame, then only the rectangle that changed), and is
 * stitched in without decoding: its image data moves into `fdAT` chunks.
 */

export interface ApngFrame {
  /** A complete PNG holding this frame's pixels (the whole canvas, or a rectangle of it). */
  readonly png: Uint8Array;
  /** Where the rectangle sits on the canvas. */
  readonly x: number;
  readonly y: number;
  readonly delayMs: number;
}

export interface ApngOptions {
  readonly width: number;
  readonly height: number;
  /** 0 plays forever. */
  readonly loops: number;
}

/** Delays are written in 1/3000 s. */
const DELAY_DEN = 3000;
const DISPOSE_NONE = 0;
const BLEND_SOURCE = 0;

/** Chunks that describe the pixels and must be the same in every frame. */
const SHARED = ['PLTE', 'tRNS'] as const;

function sameBytes(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function fcTL(seq: number, w: number, h: number, x: number, y: number, delayMs: number) {
  const data = new Uint8Array(26);
  putU32be(data, 0, seq);
  putU32be(data, 4, w);
  putU32be(data, 8, h);
  putU32be(data, 12, x);
  putU32be(data, 16, y);
  // The delay in 1/3000 s, so 30, 15 and 12 frames a second are exact.
  putU16be(data, 20, Math.max(0, Math.min(65535, Math.round(delayMs * 3))));
  putU16be(data, 22, DELAY_DEN);
  data[24] = DISPOSE_NONE;
  data[25] = BLEND_SOURCE;
  return writeChunk('fcTL', data);
}

/** Stitches frames into one APNG. The first frame must cover the whole canvas. */
export function assembleApng(options: ApngOptions, frames: readonly ApngFrame[]): Uint8Array {
  const first = frames[0];
  if (!first) throw new Error('An APNG needs at least one frame');
  const firstChunks = readChunks(first.png);
  const head = headerOf(firstChunks);
  if (head.width !== options.width || head.height !== options.height || first.x || first.y) {
    throw new Error('The first frame must be the whole canvas');
  }
  const shared = new Map(SHARED.map((t) => [t, firstChunks.find((c) => c.type === t)?.data]));

  const acTL = new Uint8Array(8);
  putU32be(acTL, 0, frames.length);
  putU32be(acTL, 4, options.loops);

  const out: Uint8Array[] = [PNG_SIGNATURE];
  for (const c of firstChunks) {
    if (c.type === 'IDAT' || c.type === 'IEND') continue;
    out.push(writeChunk(c.type, c.data));
    if (c.type === 'IHDR') out.push(writeChunk('acTL', acTL));
  }

  let seq = 0;
  frames.forEach((frame, index) => {
    const chunks = index === 0 ? firstChunks : readChunks(frame.png);
    const h = headerOf(chunks);
    if (h.bitDepth !== head.bitDepth || h.colorType !== head.colorType) {
      throw new Error(`Frame ${index} is not in the first frame's pixel format`);
    }
    for (const t of SHARED) {
      if (!sameBytes(shared.get(t), chunks.find((c) => c.type === t)?.data)) {
        throw new Error(`Frame ${index} has its own ${t}; every frame must share the first one's`);
      }
    }
    if (frame.x < 0 || frame.y < 0 || frame.x + h.width > options.width) {
      throw new Error(`Frame ${index} falls outside the canvas`);
    }
    if (frame.y + h.height > options.height)
      throw new Error(`Frame ${index} falls outside the canvas`);
    out.push(fcTL(seq++, h.width, h.height, frame.x, frame.y, frame.delayMs));
    for (const c of chunks) {
      if (c.type !== 'IDAT') continue;
      if (index === 0) {
        out.push(writeChunk('IDAT', c.data));
      } else {
        const data = new Uint8Array(4 + c.data.length);
        putU32be(data, 0, seq++);
        data.set(c.data, 4);
        out.push(writeChunk('fdAT', data));
      }
    }
  });
  out.push(writeChunk('IEND', new Uint8Array(0)));
  return concat(out);
}

export interface ApngInfo {
  readonly width: number;
  readonly height: number;
  /** False for a plain PNG (one still frame). */
  readonly animated: boolean;
  /** 0 plays forever. */
  readonly loops: number;
  readonly frames: readonly { x: number; y: number; w: number; h: number; delayMs: number }[];
  readonly byteLength: number;
}

/** What an APNG (or a plain PNG) holds, checking its sequence numbers and frame bounds. */
export function readApng(bytes: Uint8Array): ApngInfo {
  const chunks = readChunks(bytes);
  const { width, height } = headerOf(chunks);
  const acTL = chunks.find((c) => c.type === 'acTL');
  if (!acTL) {
    return {
      width,
      height,
      animated: false,
      loops: 0,
      frames: [{ x: 0, y: 0, w: width, h: height, delayMs: 0 }],
      byteLength: bytes.length,
    };
  }
  const frames: { x: number; y: number; w: number; h: number; delayMs: number }[] = [];
  let expected = 0;
  for (const c of chunks) {
    if (c.type !== 'fcTL' && c.type !== 'fdAT') continue;
    const seq = u32be(c.data, 0);
    if (seq !== expected++) throw new Error(`APNG sequence number ${seq} out of order`);
    if (c.type === 'fcTL') {
      const w = u32be(c.data, 4);
      const h = u32be(c.data, 8);
      const x = u32be(c.data, 12);
      const y = u32be(c.data, 16);
      const num = u16be(c.data, 20);
      const den = u16be(c.data, 22) || 100;
      if (x + w > width || y + h > height)
        throw new Error('An APNG frame falls outside the canvas');
      frames.push({ x, y, w, h, delayMs: (num * 1000) / den });
    }
  }
  if (frames.length !== u32be(acTL.data, 0))
    throw new Error('APNG frame count does not match acTL');
  return {
    width,
    height,
    animated: true,
    loops: u32be(acTL.data, 4),
    frames,
    byteLength: bytes.length,
  };
}
