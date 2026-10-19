/**
 * Bakes the Messages extension's icon set from the art's app icon:
 *
 *   pnpm --filter @kithfield/art-tools bake-icons [--out <targets/stickers>]
 *
 * Writes `Assets.xcassets/iMessage App Icon.stickersiconset` (the name the target's
 * `ASSETCATALOG_COMPILER_APPICON_NAME` points at). Messages draws these icons 4:3, so each is the
 * square icon at its width, cropped to its height about the middle. Every file is opaque.
 *
 * It also writes the Messages icons as loose files in `MessagesIcons/`, named as `actool` names
 * them, which the target's `CFBundleIcons` lists. `actool` only writes those files for Xcode's
 * Messages extension product type, and `@bacons/apple-targets` builds the target as a plain app
 * extension, so without them App Store processing rejects the set as incomplete (ITMS-90649).
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
  /** Listed in `CFBundleIcons`, so it ships as a loose file too. */
  readonly loose?: true;
}

/**
 * The slots of Xcode's iMessage App Icon set. Its 1024×1024 App Store slot is left out: the app's
 * own icon covers it, and beside the 1024×768 one it gave the set two large icons of one name, of
 * which the build kept either (ITMS-90645 wants the 1024×768).
 */
const SLOTS: readonly Slot[] = [
  { idiom: 'iphone', size: [29, 29], scale: 2 },
  { idiom: 'iphone', size: [29, 29], scale: 3 },
  { idiom: 'iphone', size: [60, 45], scale: 2, loose: true },
  { idiom: 'iphone', size: [60, 45], scale: 3, loose: true },
  { idiom: 'ipad', size: [29, 29], scale: 2 },
  { idiom: 'ipad', size: [67, 50], scale: 2, loose: true },
  { idiom: 'ipad', size: [74, 55], scale: 2, loose: true },
  { idiom: 'universal', size: [27, 20], scale: 2, platform: 'ios', loose: true },
  { idiom: 'universal', size: [27, 20], scale: 3, platform: 'ios', loose: true },
  { idiom: 'universal', size: [32, 24], scale: 2, platform: 'ios', loose: true },
  { idiom: 'universal', size: [32, 24], scale: 3, platform: 'ios', loose: true },
  { idiom: 'ios-marketing', size: [1024, 768], scale: 1, platform: 'ios' },
];

/** The base name `CFBundleIcons` lists the loose Messages icons by. */
const LOOSE_NAME = 'iMessage App Icon';

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
const looseDir = join(target, 'MessagesIcons');
rmSync(looseDir, { recursive: true, force: true });
mkdirSync(looseDir, { recursive: true });
writeFileSync(
  join(target, 'Assets.xcassets', 'Contents.json'),
  `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
);

const images: Record<string, string>[] = [];
const made = new Map<string, Buffer>();
for (const slot of SLOTS) {
  const [w, h] = slot.size;
  const px = [w * slot.scale, h * slot.scale] as const;
  const key = `${px[0]}x${px[1]}`;
  const filename = `icon-${key}.png`;
  let png = made.get(key);
  if (!png) {
    png = await icon(px[0], px[1]);
    writeFileSync(join(dir, filename), png);
    made.set(key, png);
  }
  if (slot.loose) writeFileSync(join(looseDir, `${LOOSE_NAME}${w}x${h}@${slot.scale}x.png`), png);
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
