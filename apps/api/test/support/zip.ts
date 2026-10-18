import { expect } from 'vitest';

import { crc32 } from '../../src/auth/export-zip';

export /** The stored entries of a zip, read through its central directory, each CRC checked. */
function unzip(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const localName = view.getUint16(local + 26, true);
    const start = local + 30 + localName;
    const bytes = zip.subarray(start, start + size);
    expect(crc32(bytes)).toBe(crc);
    files.set(name, bytes);
    at += 46 + nameLength;
  }
  return files;
}

export const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
