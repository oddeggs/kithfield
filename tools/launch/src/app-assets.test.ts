import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ICON_LAYERS } from './icon-composer';
import { MOBILE_ASSETS, ROOT } from './paths';

const config = readFileSync(join(ROOT, 'apps/mobile/app.config.ts'), 'utf8');
const dirs: Record<string, string> = {
  ICON_DIR: /const ICON_DIR = '([^']+)'/.exec(config)?.[1] ?? '',
  SPLASH_DIR: /const SPLASH_DIR = '([^']+)'/.exec(config)?.[1] ?? '',
};
/** Every asset path the app config names, with its directory constants filled in. */
const named = [...config.matchAll(/`\$\{(ICON_DIR|SPLASH_DIR)\}\/([^`]+)`/g)].map((m) =>
  join(ROOT, 'apps/mobile', dirs[m[1] ?? ''] ?? '', m[2] ?? ''),
);

describe('the icon and splash the app builds with', () => {
  it('names only files that are baked', () => {
    expect(named.length).toBeGreaterThanOrEqual(10);
    for (const file of named)
      expect({ file, exists: existsSync(file) }).toEqual({ file, exists: true });
  });

  it('has every layer the Icon Composer document names, at 1024 × 1024', async () => {
    const doc = JSON.parse(
      readFileSync(join(MOBILE_ASSETS, 'icon/Kithfield.icon/icon.json'), 'utf8'),
    ) as { groups: { layers: { 'image-name': string }[] }[] };
    const images = doc.groups.flatMap((g) => g.layers.map((l) => l['image-name']));
    expect(images.sort()).toEqual(ICON_LAYERS.map((n) => `${n}.png`).sort());
    for (const image of images) {
      const meta = await sharp(join(MOBILE_ASSETS, 'icon/Kithfield.icon/Assets', image)).metadata();
      expect([image, meta.width, meta.height]).toEqual([image, 1024, 1024]);
    }
  });

  it('keeps the flat icons opaque and the adaptive foreground and monochrome transparent', async () => {
    const opaque = [
      'app-icon.png',
      'app-icon-dark.png',
      'app-icon-tinted.png',
      'android-background.png',
    ];
    for (const name of opaque) {
      const meta = await sharp(join(MOBILE_ASSETS, 'icon', name)).metadata();
      expect([name, meta.width, meta.hasAlpha]).toEqual([name, 1024, false]);
    }
    for (const name of ['android-foreground.png', 'android-monochrome.png']) {
      const { isOpaque } = await sharp(join(MOBILE_ASSETS, 'icon', name)).stats();
      expect([name, isOpaque]).toEqual([name, false]);
    }
  });

  it('draws the launch screen at the phone’s and the iPad’s full size', async () => {
    for (const [name, size] of [
      ['horizon-day.png', [1179, 2556]],
      ['horizon-night.png', [1179, 2556]],
      ['horizon-day-tablet.png', [2064, 2752]],
      ['horizon-night-tablet.png', [2064, 2752]],
    ] as const) {
      const meta = await sharp(join(MOBILE_ASSETS, 'splash', name)).metadata();
      expect([name, meta.width, meta.height]).toEqual([name, ...size]);
    }
  });
});
