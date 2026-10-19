/**
 * Bakes the Messages extension's icon set from the art's app icon:
 *
 *   pnpm --filter @kithfield/art-tools bake-icons [--out <targets/stickers>]
 *
 * Writes `Assets.xcassets/iMessage App Icon.stickersiconset` (the name the target's
 * `ASSETCATALOG_COMPILER_APPICON_NAME` points at). Messages draws these icons 4:3, so each is the
 * square icon at its width, cropped to its height about the middle. Every file is opaque.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { createNodeArt, encodePng } from '@kithfield/art/node';
import sharp from 'sharp';

const { values } = parseArgs({ options: { out: { type: 'string' } } });

const target = values.out
  ? resolve(process.env['INIT_CWD'] ?? process.cwd(), values.out)
  : resolve(import.meta.dirname, '../../../apps/mobile/targets/stickers');

interface Slot {
  readonly idiom: 'iphone' | 'ipad' | 'universal' | 'ios-marketing';
  readonly size: readonly [number, number];
  readonly scale: 1 | 2 | 3;
  readonly platform?: 'ios';
}

/** The slots of Xcode's iMessage App Icon set. */
const SLOTS: readonly Slot[] = [
  { idiom: 'iphone', size: [29, 29], scale: 2 },
  { idiom: 'iphone', size: [29, 29], scale: 3 },
  { idiom: 'iphone', size: [60, 45], scale: 2 },
  { idiom: 'iphone', size: [60, 45], scale: 3 },
  { idiom: 'ipad', size: [29, 29], scale: 2 },
  { idiom: 'ipad', size: [67, 50], scale: 2 },
  { idiom: 'ipad', size: [74, 55], scale: 2 },
  { idiom: 'ios-marketing', size: [1024, 1024], scale: 1 },
  { idiom: 'universal', size: [27, 20], scale: 2, platform: 'ios' },
  { idiom: 'universal', size: [27, 20], scale: 3, platform: 'ios' },
  { idiom: 'universal', size: [32, 24], scale: 2, platform: 'ios' },
  { idiom: 'universal', size: [32, 24], scale: 3, platform: 'ios' },
  { idiom: 'ios-marketing', size: [1024, 768], scale: 1, platform: 'ios' },
];

/** The page colour behind the art, so no icon carries alpha. */
const PAPER = { r: 0xf5, g: 0xee, b: 0xe2 };

const errors: string[] = [];
const art = await createNodeArt({ onError: (m) => errors.push(m) });

async function icon(width: number, height: number): Promise<Buffer> {
  const image = art.image({ scene: 'appicon', width, height: width, dpr: 1 }, 0);
  if (!image) throw new Error('appicon: nothing drawn');
  return sharp(Buffer.from(encodePng(image)))
    .extract({ left: 0, top: Math.round((width - height) / 2), width, height })
    .flatten({ background: PAPER })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const dir = join(target, 'Assets.xcassets', 'iMessage App Icon.stickersiconset');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(target, 'Assets.xcassets', 'Contents.json'),
  `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
);

const images: Record<string, string>[] = [];
const made = new Map<string, string>();
for (const slot of SLOTS) {
  const [w, h] = slot.size;
  const px = [w * slot.scale, h * slot.scale] as const;
  const key = `${px[0]}x${px[1]}`;
  let filename = made.get(key);
  if (!filename) {
    filename = `icon-${key}.png`;
    writeFileSync(join(dir, filename), await icon(px[0], px[1]));
    made.set(key, filename);
  }
  images.push({
    filename,
    idiom: slot.idiom,
    ...(slot.platform ? { platform: slot.platform } : {}),
    scale: `${slot.scale}x`,
    size: `${w}x${h}`,
  });
}
writeFileSync(
  join(dir, 'Contents.json'),
  `${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`wrote ${made.size} icons for ${SLOTS.length} slots into ${dir}`);
