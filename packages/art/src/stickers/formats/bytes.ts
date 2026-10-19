/*
 * Byte helpers for the sticker formats: plain `Uint8Array`s, so the same code runs on the phone
 * (Hermes) and in Node.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (ISO 3309), as PNG chunks use it, over one or more byte runs. */
export function crc32(...parts: readonly Uint8Array[]): number {
  let c = 0xffffffff;
  for (const bytes of parts) {
    for (let i = 0; i < bytes.length; i++) {
      c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const at = (bytes: Uint8Array, i: number): number => {
  const v = bytes[i];
  if (v === undefined) throw new RangeError(`Read past the end (${i} of ${bytes.length})`);
  return v;
};

export function u16be(bytes: Uint8Array, i: number): number {
  return (at(bytes, i) << 8) | at(bytes, i + 1);
}

export function u32be(bytes: Uint8Array, i: number): number {
  return (
    ((at(bytes, i) << 24) |
      (at(bytes, i + 1) << 16) |
      (at(bytes, i + 2) << 8) |
      at(bytes, i + 3)) >>>
    0
  );
}

export function u16le(bytes: Uint8Array, i: number): number {
  return at(bytes, i) | (at(bytes, i + 1) << 8);
}

export function u24le(bytes: Uint8Array, i: number): number {
  return at(bytes, i) | (at(bytes, i + 1) << 8) | (at(bytes, i + 2) << 16);
}

export function u32le(bytes: Uint8Array, i: number): number {
  return (u24le(bytes, i) | (at(bytes, i + 3) << 24)) >>> 0;
}

export function putU16be(out: Uint8Array, i: number, v: number): void {
  out[i] = (v >>> 8) & 0xff;
  out[i + 1] = v & 0xff;
}

export function putU32be(out: Uint8Array, i: number, v: number): void {
  out[i] = (v >>> 24) & 0xff;
  out[i + 1] = (v >>> 16) & 0xff;
  out[i + 2] = (v >>> 8) & 0xff;
  out[i + 3] = v & 0xff;
}

export function putU16le(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
}

export function putU24le(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
  out[i + 2] = (v >>> 16) & 0xff;
}

export function putU32le(out: Uint8Array, i: number, v: number): void {
  putU24le(out, i, v);
  out[i + 3] = (v >>> 24) & 0xff;
}

/** Four ASCII letters as bytes (a chunk or box type). */
export function fourcc(name: string): Uint8Array {
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) out[i] = name.charCodeAt(i) & 0xff;
  return out;
}

/** Bytes `[i, i + 4)` as ASCII. */
export function fourccAt(bytes: Uint8Array, i: number): string {
  return String.fromCharCode(at(bytes, i), at(bytes, i + 1), at(bytes, i + 2), at(bytes, i + 3));
}
