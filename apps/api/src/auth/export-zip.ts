/*
 * A streaming zip writer for the keepsakes export: entries are stored (not compressed: photos,
 * video and voice notes are compressed already), each followed by a data descriptor carrying its
 * CRC-32, so an entry's bytes can be streamed straight from R2 without holding them. The total
 * length is known before writing, which R2 needs for a streamed upload. No zip64: the export keeps
 * well under 4 GB.
 */

/** One file in the zip: its bytes in memory, or streamed with a known length. */
export type ZipEntry =
  | { readonly name: string; readonly bytes: Uint8Array }
  | { readonly name: string; readonly size: number; readonly open: () => Promise<ReadableStream> };

const LOCAL_HEADER = 30;
const DESCRIPTOR = 16;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
/** General purpose flags: sizes and CRC follow in a data descriptor (3), UTF-8 names (11). */
const FLAGS = (1 << 3) | (1 << 11);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Continues a CRC-32 over more bytes; start from 0. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return ~c >>> 0;
}

const sizeOf = (entry: ZipEntry) => ('bytes' in entry ? entry.bytes.length : entry.size);

/** The zip's length in bytes, before any of it is written. */
export function zipLength(entries: readonly ZipEntry[]): number {
  const encoder = new TextEncoder();
  return (
    entries.reduce((total, entry) => {
      const name = encoder.encode(entry.name).length;
      return total + LOCAL_HEADER + name + sizeOf(entry) + DESCRIPTOR + CENTRAL_HEADER + name;
    }, 0) + END_RECORD
  );
}

/** MS-DOS time and date fields for an instant (UTC). */
function dosTime(at: number): { time: number; date: number } {
  const d = new Date(at);
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function record(size: number, fill: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size);
  fill(new DataView(bytes.buffer));
  return bytes;
}

/** Writes the entries as a zip, then closes the writer; aborts it if anything fails. */
export async function writeZip(
  writable: WritableStream<Uint8Array>,
  entries: readonly ZipEntry[],
  at: number,
): Promise<void> {
  const writer = writable.getWriter();
  const { time, date } = dosTime(at);
  const encoder = new TextEncoder();
  const central: Uint8Array[] = [];
  let offset = 0;
  const write = async (bytes: Uint8Array) => {
    await writer.write(bytes);
    offset += bytes.length;
  };
  try {
    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const start = offset;
      await write(
        record(LOCAL_HEADER, (v) => {
          v.setUint32(0, 0x04034b50, true);
          v.setUint16(4, 20, true);
          v.setUint16(6, FLAGS, true);
          v.setUint16(10, time, true);
          v.setUint16(12, date, true);
          v.setUint16(26, name.length, true);
        }),
      );
      await write(name);
      let crc = 0;
      let written = 0;
      if ('bytes' in entry) {
        crc = crc32(entry.bytes);
        written = entry.bytes.length;
        await write(entry.bytes);
      } else {
        const reader = (await entry.open()).getReader() as ReadableStreamDefaultReader<Uint8Array>;
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          const chunk = next.value;
          crc = crc32(chunk, crc);
          written += chunk.length;
          await write(chunk);
        }
      }
      if (written !== sizeOf(entry)) throw new Error(`zip entry changed size: ${entry.name}`);
      await write(
        record(DESCRIPTOR, (v) => {
          v.setUint32(0, 0x08074b50, true);
          v.setUint32(4, crc, true);
          v.setUint32(8, written, true);
          v.setUint32(12, written, true);
        }),
      );
      const header = record(CENTRAL_HEADER, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true);
        v.setUint16(6, 20, true);
        v.setUint16(8, FLAGS, true);
        v.setUint16(12, time, true);
        v.setUint16(14, date, true);
        v.setUint32(16, crc, true);
        v.setUint32(20, written, true);
        v.setUint32(24, written, true);
        v.setUint16(28, name.length, true);
        v.setUint32(42, start, true);
      });
      central.push(header, name);
    }
    const centralStart = offset;
    for (const part of central) await write(part);
    const centralSize = offset - centralStart;
    await write(
      record(END_RECORD, (v) => {
        v.setUint32(0, 0x06054b50, true);
        v.setUint16(8, entries.length, true);
        v.setUint16(10, entries.length, true);
        v.setUint32(12, centralSize, true);
        v.setUint32(16, centralStart, true);
      }),
    );
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    throw error;
  }
}
