/**
 * Checks every baked asset against its store slot and compares each still with its design render:
 *
 *   pnpm --filter @kithfield/launch check [-- --sheets <dir>]
 *
 * For each file in `store/manifest.json`: it exists, its pixel size is what the manifest says and
 * what its slot accepts, it has no alpha where the store refuses it, it's under the slot's file
 * size cap, and a clip has the length, frame rate and audio the manifest promises. A still with a
 * reference is scaled down onto its region of the render (`design/renders`), and the mean
 * difference (out of 255) and the share of pixels more than 16 apart are printed; `--sheets`
 * writes each side by side.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import sharp from 'sharp';

import { SLOTS, type Slot, fitsSlot } from './limits';
import { type ManifestEntry, readManifest } from './manifest';
import { RENDERS_DIR, STORE_DIR } from './paths';
import { FPS } from './specs';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { sheets: { type: 'string' } },
});
const sheets = values.sheets
  ? resolve(process.env['INIT_CWD'] ?? process.cwd(), values.sheets)
  : null;
if (sheets) mkdirSync(sheets, { recursive: true });

interface RenderIndex {
  renders: Record<string, { file: string; scale: number }>;
}
const index = JSON.parse(readFileSync(join(RENDERS_DIR, 'index.json'), 'utf8')) as RenderIndex;

/** Mean channel difference and the share of pixels more than `threshold` apart, two RGB buffers of one size. */
function difference(a: Buffer, b: Buffer, threshold = 16): { mean: number; over: number } {
  let sum = 0;
  let over = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(
      Math.abs((a[i] ?? 0) - (b[i] ?? 0)),
      Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)),
      Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0)),
    );
    sum +=
      Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
      Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
      Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
    if (d > threshold) over++;
  }
  const pixels = a.length / 3;
  return { mean: sum / a.length, over: over / pixels };
}

async function compare(entry: ManifestEntry, file: string): Promise<string> {
  const ref = entry.reference;
  if (!ref) return '';
  const render = index.renders[ref.render];
  if (!render) return `no render ${ref.render}`;
  const [x, y, w, h] = ref.rect;
  const s = render.scale;
  const region = {
    left: Math.round(x * s),
    top: Math.round(y * s),
    width: Math.round(w * s),
    height: Math.round(h * s),
  };
  const theirs = await sharp(join(RENDERS_DIR, render.file))
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer();
  // The asset is cut from the box's middle, so it's matched to the region by covering it.
  const ours = await sharp(file)
    .resize(region.width, region.height, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const { mean, over } = difference(ours, theirs);
  if (sheets) {
    const raw = { raw: { width: region.width, height: region.height, channels: 3 as const } };
    await sharp({
      create: {
        width: region.width * 2 + 8,
        height: region.height,
        channels: 3,
        background: '#888',
      },
    })
      .composite([
        { input: theirs, ...raw, left: 0, top: 0 },
        { input: ours, ...raw, left: region.width + 8, top: 0 },
      ])
      .png()
      .toFile(join(sheets, `${entry.file.replaceAll('/', '__')}`));
  }
  return `vs ${ref.render}: mean ${mean.toFixed(1)}/255, ${(over * 100).toFixed(1)}% over 16`;
}

function probe(file: string): {
  width: number;
  height: number;
  seconds: number;
  fps: number;
  audio: boolean;
} {
  const out = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,width,height,r_frame_rate:format=duration',
      '-of',
      'json',
      file,
    ],
    { encoding: 'utf8' },
  );
  const info = JSON.parse(out) as {
    streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[];
    format: { duration: string };
  };
  const video = info.streams.find((s) => s.codec_type === 'video');
  const [n, d] = (video?.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    seconds: Number(info.format.duration),
    fps: (n ?? 0) / (d || 1),
    audio: info.streams.some((s) => s.codec_type === 'audio'),
  };
}

const problems: string[] = [];
const { assets } = readManifest();
for (const entry of assets) {
  const file = join(STORE_DIR, entry.file);
  const slot: Slot = SLOTS[entry.slot];
  const say = (problem: string) => problems.push(`${entry.file}: ${problem}`);
  if (!existsSync(file)) {
    say('missing; bake it');
    continue;
  }
  const bytes = statSync(file).size;
  if (slot.maxBytes && bytes > slot.maxBytes) say(`${bytes} bytes is over ${slot.maxBytes}`);
  let line = `${entry.file}  ${entry.width}×${entry.height}  ${(bytes / 1024 / 1024).toFixed(2)} MB  ${slot.name}`;
  if (entry.file.endsWith('.mp4')) {
    const clip = probe(file);
    if (clip.width !== entry.width || clip.height !== entry.height)
      say(`is ${clip.width}×${clip.height}`);
    if (Math.abs(clip.fps - FPS) > 0.01) say(`plays at ${clip.fps} fps`);
    if (entry.slot === 'appPreview69' && (clip.seconds < 15 || clip.seconds > 30)) {
      say(`runs ${clip.seconds} s, outside 15 to 30 s`);
    }
    if (entry.slot === 'appPreview69' && !clip.audio) say('has no audio track');
    line += `  ${clip.seconds.toFixed(2)} s at ${clip.fps} fps${clip.audio ? ', silent stereo track' : ''}`;
  } else {
    const meta = await sharp(file).metadata();
    if (meta.width !== entry.width || meta.height !== entry.height)
      say(`is ${meta.width}×${meta.height}`);
    if (slot.opaque && meta.hasAlpha) say('has an alpha channel');
    const fit = fitsSlot(slot, [meta.width, meta.height]);
    if (fit) say(fit);
    line += `  ${await compare(entry, file)}`;
  }
  console.log(line);
}

console.log(`\n${assets.length} assets checked`);
if (problems.length > 0) {
  console.log(problems.join('\n'));
  process.exitCode = 1;
}
