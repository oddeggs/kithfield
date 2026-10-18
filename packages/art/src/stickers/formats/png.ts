import { concat, crc32, fourcc, fourccAt, putU32be, u32be } from './bytes';

/** The eight bytes every PNG starts with. */
export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

export interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
}

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** The chunks of a PNG, in order, with their CRCs checked. */
export function readChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error('Not a PNG');
  const chunks: PngChunk[] = [];
  let i = PNG_SIGNATURE.length;
  while (i + 12 <= bytes.length) {
    const length = u32be(bytes, i);
    const type = fourccAt(bytes, i + 4);
    const end = i + 8 + length;
    if (end + 4 > bytes.length) throw new Error(`PNG chunk ${type} runs past the end`);
    const data = bytes.subarray(i + 8, end);
    if (crc32(bytes.subarray(i + 4, i + 8), data) !== u32be(bytes, end)) {
      throw new Error(`PNG chunk ${type} has a bad CRC`);
    }
    chunks.push({ type, data });
    i = end + 4;
    if (type === 'IEND') break;
  }
  return chunks;
}

/** One chunk as bytes: length, type, data, CRC. */
export function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  putU32be(out, 0, data.length);
  const name = fourcc(type);
  out.set(name, 4);
  out.set(data, 8);
  putU32be(out, 8 + data.length, crc32(name, data));
  return out;
}

export function headerOf(chunks: readonly PngChunk[]): PngHeader {
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr || ihdr.data.length < 13) throw new Error('PNG without IHDR');
  return {
    width: u32be(ihdr.data, 0),
    height: u32be(ihdr.data, 4),
    bitDepth: ihdr.data[8] ?? 0,
    colorType: ihdr.data[9] ?? 0,
  };
}

/** A PNG's size without reading its pixels. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const { width, height } = headerOf(readChunks(bytes));
  return { width, height };
}

/** Builds a PNG from chunks (signature first, IEND last). */
export function writePng(chunks: readonly PngChunk[]): Uint8Array {
  return concat([PNG_SIGNATURE, ...chunks.map((c) => writeChunk(c.type, c.data))]);
}
