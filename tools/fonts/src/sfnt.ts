/**
 * Just enough of the OpenType file format to check a font file: the table directory, the
 * character map (formats 4 and 12), the names and the weight class.
 */

interface Table {
  offset: number;
  length: number;
}

export interface FontInfo {
  /** Name ID 1, or the typographic family (ID 16) when the font has one. */
  family: string;
  /** Name ID 6. */
  postScriptName: string;
  /** OS/2 usWeightClass. */
  weight: number;
  /** True when the font has variation axes (an `fvar` table). */
  variable: boolean;
  /** Every code point the font maps to a glyph other than .notdef. */
  codePoints: ReadonlySet<number>;
}

function tables(view: DataView): Map<string, Table> {
  const count = view.getUint16(4);
  const out = new Map<string, Table>();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(at),
      view.getUint8(at + 1),
      view.getUint8(at + 2),
      view.getUint8(at + 3),
    );
    out.set(tag, { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  return out;
}

function table(map: Map<string, Table>, tag: string): Table {
  const table = map.get(tag);
  if (!table) throw new Error(`font has no ${tag} table`);
  return table;
}

function format4(view: DataView, at: number, out: Set<number>): void {
  const segments = view.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const end = view.getUint16(ends + s * 2);
    const start = view.getUint16(starts + s * 2);
    const delta = view.getInt16(deltas + s * 2);
    const rangeAt = rangeOffsets + s * 2;
    const rangeOffset = view.getUint16(rangeAt);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        const raw = view.getUint16(rangeAt + rangeOffset + (c - start) * 2);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(c);
    }
  }
}

function format12(view: DataView, at: number, out: Set<number>): void {
  const groups = view.getUint32(at + 12);
  for (let g = 0; g < groups; g++) {
    const group = at + 16 + g * 12;
    const start = view.getUint32(group);
    const end = view.getUint32(group + 4);
    const firstGlyph = view.getUint32(group + 8);
    for (let c = start; c <= end; c++) if (firstGlyph + (c - start) !== 0) out.add(c);
  }
}

/** Unicode subtables only: platform 0, or Windows (3) with BMP (1) or full (10) encodings. */
function codePoints(view: DataView, cmap: Table): Set<number> {
  const out = new Set<number>();
  const count = view.getUint16(cmap.offset + 2);
  for (let i = 0; i < count; i++) {
    const record = cmap.offset + 4 + i * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const at = cmap.offset + view.getUint32(record + 4);
    const format = view.getUint16(at);
    if (format === 4) format4(view, at, out);
    else if (format === 12) format12(view, at, out);
  }
  return out;
}

/** Windows Unicode English names, by name ID. */
function names(view: DataView, name: Table): Map<number, string> {
  const out = new Map<number, string>();
  const count = view.getUint16(name.offset + 2);
  const strings = name.offset + view.getUint16(name.offset + 4);
  for (let i = 0; i < count; i++) {
    const record = name.offset + 6 + i * 12;
    const platform = view.getUint16(record);
    const language = view.getUint16(record + 4);
    if (platform !== 3 || language !== 0x409) continue;
    const id = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const at = strings + view.getUint16(record + 10);
    let text = '';
    for (let b = 0; b < length; b += 2) text += String.fromCharCode(view.getUint16(at + b));
    out.set(id, text);
  }
  return out;
}

export function readFont(bytes: Uint8Array): FontInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const map = tables(view);
  const nameTable = names(view, table(map, 'name'));
  return {
    family: nameTable.get(16) ?? nameTable.get(1) ?? '',
    postScriptName: nameTable.get(6) ?? '',
    weight: view.getUint16(table(map, 'OS/2').offset + 4),
    variable: map.has('fvar'),
    codePoints: codePoints(view, table(map, 'cmap')),
  };
}
