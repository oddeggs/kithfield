/*
 * A small WebM (Matroska/EBML) reader: enough to check a Telegram video sticker without decoding
 * a frame. It reads the header, the tracks and the block timecodes.
 */

export interface WebmInfo {
  readonly docType: string;
  /** The video track's codec, such as `V_VP9`; null without a video track. */
  readonly codec: string | null;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly frameCount: number;
  /** Frames a second, from the block timecodes. */
  readonly fps: number;
  readonly hasAudio: boolean;
  /** An alpha channel: `AlphaMode` on the track, or alpha frames in `BlockAdditions`. */
  readonly hasAlpha: boolean;
  readonly byteLength: number;
}

const ID = {
  ebml: 0x1a45dfa3,
  docType: 0x4282,
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  duration: 0x4489,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  codecId: 0x86,
  defaultDuration: 0x23e383,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  alphaMode: 0x53c0,
  cluster: 0x1f43b675,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  blockAdditions: 0x75a1,
  cues: 0x1c53bb6b,
  tags: 0x1254c367,
} as const;

const MASTERS = new Set<number>([
  ID.ebml,
  ID.segment,
  ID.info,
  ID.tracks,
  ID.trackEntry,
  ID.video,
  ID.cluster,
  ID.blockGroup,
]);

/** Top-level elements that end a cluster written with an unknown size. */
const CLUSTER_ENDS = new Set<number>([ID.cluster, ID.cues, ID.tags]);

interface Element {
  readonly id: number;
  readonly start: number;
  /** Null for an unknown size (a live recording). */
  readonly end: number | null;
  readonly dataStart: number;
}

function byteAt(bytes: Uint8Array, i: number): number {
  const v = bytes[i];
  if (v === undefined) throw new RangeError('WebM ends inside an element');
  return v;
}

/** A variable-length integer's length from its first byte. */
function vintLength(first: number): number {
  for (let n = 1; n <= 8; n++) if (first & (0x80 >> (n - 1))) return n;
  throw new Error('Bad EBML variable-length integer');
}

function readElement(bytes: Uint8Array, i: number): Element {
  const idLength = vintLength(byteAt(bytes, i));
  let id = 0;
  for (let k = 0; k < idLength; k++) id = id * 256 + byteAt(bytes, i + k);
  const s = i + idLength;
  const sizeLength = vintLength(byteAt(bytes, s));
  let size = byteAt(bytes, s) & (0xff >> sizeLength);
  let unknown = size === 0xff >> sizeLength;
  for (let k = 1; k < sizeLength; k++) {
    const b = byteAt(bytes, s + k);
    if (b !== 0xff) unknown = false;
    size = size * 256 + b;
  }
  const dataStart = s + sizeLength;
  return { id, start: i, end: unknown ? null : dataStart + size, dataStart };
}

function uint(bytes: Uint8Array, e: Element): number {
  let v = 0;
  for (let i = e.dataStart; i < (e.end ?? e.dataStart); i++) v = v * 256 + byteAt(bytes, i);
  return v;
}

function float(bytes: Uint8Array, e: Element): number {
  const length = (e.end ?? e.dataStart) - e.dataStart;
  const view = new DataView(bytes.buffer, bytes.byteOffset + e.dataStart, length);
  if (length === 4) return view.getFloat32(0);
  if (length === 8) return view.getFloat64(0);
  return 0;
}

function string(bytes: Uint8Array, e: Element): string {
  let s = '';
  for (let i = e.dataStart; i < (e.end ?? e.dataStart); i++) {
    const c = byteAt(bytes, i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

interface Track {
  number: number;
  type: number;
  codec: string;
  width: number;
  height: number;
  alpha: boolean;
  defaultDurationNs: number;
}

/** What a WebM holds: its video track, how long it plays and at what rate. */
export function readWebm(bytes: Uint8Array): WebmInfo {
  let docType = '';
  let scaleNs = 1_000_000;
  let durationTicks = 0;
  const tracks: Track[] = [];
  let track: Track | null = null;
  let clusterTime = 0;
  const times: number[] = [];
  let alphaBlocks = false;

  const block = (start: number) => {
    const numberLength = vintLength(byteAt(bytes, start));
    const number = byteAt(bytes, start) & (0xff >> numberLength);
    const video = tracks.find((t) => t.type === 1);
    if (!video || number !== video.number) return;
    const rel =
      (byteAt(bytes, start + numberLength) << 8) | byteAt(bytes, start + numberLength + 1);
    times.push(clusterTime + (rel >= 0x8000 ? rel - 0x10000 : rel));
  };

  const walk = (from: number, to: number, inCluster: boolean): number => {
    let i = from;
    while (i < to) {
      const e = readElement(bytes, i);
      // A cluster of unknown size ends where the next top-level element starts.
      if (inCluster && CLUSTER_ENDS.has(e.id)) return i;
      const end = e.end ?? to;
      if (end > bytes.length) throw new Error('WebM element runs past the end');
      switch (e.id) {
        case ID.docType:
          docType = string(bytes, e);
          break;
        case ID.timecodeScale:
          scaleNs = uint(bytes, e);
          break;
        case ID.duration:
          durationTicks = float(bytes, e);
          break;
        case ID.trackEntry:
          track = {
            number: 0,
            type: 0,
            codec: '',
            width: 0,
            height: 0,
            alpha: false,
            defaultDurationNs: 0,
          };
          tracks.push(track);
          break;
        case ID.trackNumber:
          if (track) track.number = uint(bytes, e);
          break;
        case ID.trackType:
          if (track) track.type = uint(bytes, e);
          break;
        case ID.codecId:
          if (track) track.codec = string(bytes, e);
          break;
        case ID.defaultDuration:
          if (track) track.defaultDurationNs = uint(bytes, e);
          break;
        case ID.pixelWidth:
          if (track) track.width = uint(bytes, e);
          break;
        case ID.pixelHeight:
          if (track) track.height = uint(bytes, e);
          break;
        case ID.alphaMode:
          if (track) track.alpha = uint(bytes, e) === 1;
          break;
        case ID.timecode:
          clusterTime = uint(bytes, e);
          break;
        case ID.simpleBlock:
        case ID.block:
          block(e.dataStart);
          break;
        case ID.blockAdditions:
          alphaBlocks = true;
          break;
        default:
          break;
      }
      if (MASTERS.has(e.id)) {
        if (e.id === ID.cluster && e.end === null) {
          i = walk(e.dataStart, to, true);
          continue;
        }
        walk(e.dataStart, end, false);
      }
      i = end;
    }
    return i;
  };
  walk(0, bytes.length, false);

  const video = tracks.find((t) => t.type === 1) ?? null;
  const tickMs = scaleNs / 1_000_000;
  const sorted = [...times].sort((a, b) => a - b);
  // Timecodes are rounded to the tick (a millisecond), so the rate comes from the whole span.
  const span =
    sorted.length > 1 ? ((sorted[sorted.length - 1] ?? 0) - (sorted[0] ?? 0)) * tickMs : 0;
  const step = span > 0 ? span / (sorted.length - 1) : (video?.defaultDurationNs ?? 0) / 1e6;
  const frameMs = video?.defaultDurationNs ? video.defaultDurationNs / 1e6 : step;
  const durationMs = durationTicks > 0 ? durationTicks * tickMs : span + frameMs;
  return {
    docType,
    codec: video?.codec ?? null,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    durationMs,
    frameCount: times.length,
    fps: step > 0 ? 1000 / step : 0,
    hasAudio: tracks.some((t) => t.type === 2),
    hasAlpha: (video?.alpha ?? false) || alphaBlocks,
    byteLength: bytes.length,
  };
}
