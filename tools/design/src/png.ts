import { inflateSync } from 'node:zlib';

/** Decoded 8-bit PNG pixels, `channels` bytes per pixel, row after row. */
export interface Pixels {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes the PNGs Chromium writes: 8-bit grey, RGB or RGBA, not interlaced. */
export function decodePng(png: Uint8Array): Pixels {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Uint8Array[] = [];
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const depth = body[8];
      channels = CHANNELS[body[9] ?? -1] ?? 0;
      if (depth !== 8 || !channels || body[12] !== 0) {
        throw new Error('Only 8-bit, non-interlaced grey, RGB and RGBA PNGs are supported');
      }
    } else if (type === 'IDAT') chunks.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? (data[row + x - channels] ?? 0) : 0;
      const b = y > 0 ? (data[row - stride + x] ?? 0) : 0;
      const c = x >= channels && y > 0 ? (data[row - stride + x - channels] ?? 0) : 0;
      const v = raw[src + x] ?? 0;
      const predicted =
        filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0;
      data[row + x] = (v + predicted) & 0xff;
    }
  }
  return { width, height, channels, data };
}

export interface PixelDrift {
  /** Pixels whose colour differs at all (every pixel when the sizes differ). */
  differing: number;
  /** The share of the first image's pixels that differ. */
  share: number;
  /** The largest difference in any channel, out of 255. */
  max: number;
}

/** How far apart two renders are, pixel by pixel. */
export function pixelDrift(a: Pixels, b: Pixels): PixelDrift {
  const pixels = a.width * a.height;
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    return { differing: pixels, share: 1, max: 255 };
  }
  let differing = 0;
  let max = 0;
  for (let i = 0; i < a.data.length; i += a.channels) {
    let pixel = 0;
    for (let k = 0; k < a.channels; k++) {
      pixel = Math.max(pixel, Math.abs((a.data[i + k] ?? 0) - (b.data[i + k] ?? 0)));
    }
    if (pixel > 0) differing++;
    max = Math.max(max, pixel);
  }
  return { differing, share: pixels ? differing / pixels : 0, max };
}

/** Renders that differ in no more than this share of pixels (0.01%) are the same render. */
export const DRIFT_TOLERANCE = 0.0001;
