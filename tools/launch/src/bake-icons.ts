import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type SceneAttrs } from '@kithfield/art';
import { createNodeArt, encodePng } from '@kithfield/art/node';
import sharp from 'sharp';

import { writeOpaquePng } from './bake-boards';
import { ICON_LAYERS, type IconLayerName, iconDocument } from './icon-composer';
import { type ManifestEntry } from './manifest';
import { MOBILE_ASSETS, STORE_DIR } from './paths';

/** The chosen icon: a critter in a lit window (`icon2`, option a). */
const ICON = { scene: 'icon2', name: 'a' } as const;

/** Launch background, day and night. */
export const PAPER = { day: '#F5EEE2', night: '#241E26' } as const;
/** The dusk sky's middle stop, and the dark sky's, as the Icon Composer fill. */
const SKY_FILL = { day: '#F2C49A', dark: '#6A4352' } as const;

/** What each Icon Composer layer is in the art: an `items` subset, by day or dark. */
const LAYER_ART: Record<IconLayerName, SceneAttrs> = {
  critter: { items: 'critter' },
  glow: { items: 'glow' },
  cottage: { items: 'cottage' },
  hill: { items: 'hill' },
  'hill-dark': { items: 'hill', state: 'dark' },
  sky: { items: 'sky' },
  'sky-dark': { items: 'sky', state: 'dark' },
};

/** The 16 critters and the three looks "your critter" ships in, as `AltIcon-{critter}-{look}`. */
export const ALT_CRITTERS = [
  'mouse',
  'rabbit',
  'tortoise',
  'fox',
  'duck',
  'bear',
  'hedgehog',
  'otter',
  'frog',
  'capybara',
  'cat',
  'owl',
  'badger',
  'mole',
  'raccoon',
  'sheep',
] as const;
/** The outfit colours `13 Launch` shows each look in. */
export const ALT_LOOKS = { scarf: '#5E7F4A', beanie: '#6f8faa', bow: '#d4704e' } as const;
export const ALT_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** Android's adaptive icon canvas is 108 dp, of which the launcher shows the middle 72. */
const ADAPTIVE_VIEW = 72 / 108;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export async function bakeIcons(): Promise<ManifestEntry[]> {
  const errors: string[] = [];
  const art = await createNodeArt({ onError: (m) => errors.push(m) });
  const draw = (
    attrs: SceneAttrs,
    width: number,
    height = width,
    scene: string = ICON.scene,
    dpr = 1,
  ) => {
    const image = art.image(
      {
        scene,
        width,
        height,
        dpr,
        attrs: scene === ICON.scene ? { name: ICON.name, ...attrs } : attrs,
      },
      1.2,
    );
    if (!image) throw new Error(`${scene} ${JSON.stringify(attrs)}: nothing drawn`);
    return Buffer.from(encodePng(image));
  };
  const write = (file: string, png: Buffer) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
  };
  const entries: ManifestEntry[] = [];
  const iconDir = join(MOBILE_ASSETS, 'icon');

  // iOS 26: the Icon Composer document and its layers.
  const doc = join(iconDir, 'Kithfield.icon');
  rmSync(doc, { recursive: true, force: true });
  for (const name of ICON_LAYERS) {
    write(
      join(doc, 'Assets', `${name}.png`),
      await sharp(draw(LAYER_ART[name], 1024)).png().toBuffer(),
    );
  }
  write(
    join(doc, 'icon.json'),
    Buffer.from(`${JSON.stringify(iconDocument(SKY_FILL), null, 2)}\n`),
  );

  // The flat icon (Android's legacy icon, the web, the store's 1024) and its dark and tinted looks.
  for (const [suffix, attrs] of [
    ['', {}],
    ['-dark', { state: 'dark' }],
    ['-tinted', { state: 'tinted' }],
  ] as const) {
    await writeOpaquePng(join(iconDir, `app-icon${suffix}.png`), sharp(draw(attrs, 1024)));
  }

  // Android adaptive icon: the composite's view is the launcher's middle 72 dp.
  const inner = Math.round(1024 * ADAPTIVE_VIEW);
  const pad = Math.floor((1024 - inner) / 2);
  const padded = (png: Buffer) =>
    sharp(png)
      .extend({
        top: pad,
        bottom: 1024 - inner - pad,
        left: pad,
        right: 1024 - inner - pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  write(join(iconDir, 'android-foreground.png'), await padded(draw({ items: 'fg' }, inner)));
  write(
    join(iconDir, 'android-monochrome.png'),
    await padded(draw({ state: 'mono', color: '#ffffff' }, inner)),
  );
  // The sky and hill reach past the view so the hill meets the cottage where it does on iOS:
  // mirrored above and to the sides, and the grass carried straight down.
  const sky = await sharp(draw({ items: 'bg' }, inner))
    .extend({ top: pad, left: pad, right: 1024 - inner - pad, extendWith: 'mirror' })
    .png()
    .toBuffer();
  await writeOpaquePng(
    join(iconDir, 'android-background.png'),
    sharp(sky).extend({ bottom: 1024 - inner - pad, extendWith: 'copy' }),
  );

  // Splash: the first frame of the farm drawing in, day and night; phone and tablet.
  const splashDir = join(MOBILE_ASSETS, 'splash');
  for (const [name, attrs] of [
    ['horizon-day', {}],
    ['horizon-night', { night: 'true' }],
  ] as const) {
    await writeOpaquePng(
      join(splashDir, `${name}.png`),
      sharp(draw(attrs, 393, 852, 'horizon', 3)),
    );
    await writeOpaquePng(
      join(splashDir, `${name}-tablet.png`),
      sharp(draw(attrs, 1032, 1376, 'horizon', 2)),
    );
  }
  // Android 12+: the lit window in its circle, filling the square so the system's mask keeps it whole.
  const circle = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><circle cx="512" cy="512" r="512"/></svg>',
  );
  write(
    join(splashDir, 'icon-window.png'),
    await sharp(draw({ progress: '1' }, 1024))
      .composite([{ input: circle, blend: 'dest-in' }])
      .png()
      .toBuffer(),
  );

  // Store copies.
  const storeIcon = (
    file: string,
    png: Buffer,
    size: number,
    slot: 'appIcon' | 'playIcon',
  ): ManifestEntry => {
    write(join(STORE_DIR, file), png);
    return {
      file,
      slot,
      width: size,
      height: size,
      language: 'en',
      source: 'the art: icon2, option a',
    };
  };
  entries.push(
    storeIcon(
      'ios/app-icon-1024.png',
      await sharp(draw({}, 1024)).removeAlpha().png().toBuffer(),
      1024,
      'appIcon',
    ),
    storeIcon('android/icon-512.png', await sharp(draw({}, 512)).png().toBuffer(), 512, 'playIcon'),
  );

  // The Android 12 splash's frames (the window lighting up over 700 ms), for its animated drawable.
  for (const [name, attrs] of [
    ['0ms', { progress: '0' }],
    ['300ms', { progress: '0.35' }],
    ['700ms', { progress: '1' }],
  ] as const) {
    write(join(STORE_DIR, `icons/android-splash/${name}.png`), draw(attrs, 432));
  }

  // Alternate icons for patrons: every critter in three looks, and the four seasons.
  const altDir = join(STORE_DIR, 'icons/alternate');
  rmSync(altDir, { recursive: true, force: true });
  let alternates = 0;
  for (const kind of ALT_CRITTERS) {
    for (const [look, color] of Object.entries(ALT_LOOKS)) {
      await writeOpaquePng(
        join(altDir, `AltIcon-${kind}-${look}.png`),
        sharp(draw({ kind, outfit: look, ocolor: color }, 1024)),
      );
      alternates++;
    }
  }
  for (const season of ALT_SEASONS) {
    await writeOpaquePng(
      join(altDir, `AltIcon-Season-${cap(season)}.png`),
      sharp(draw({ alt: 'true', season }, 1024)),
    );
    alternates++;
  }

  if (errors.length > 0) throw new Error(`The art reported errors:\n${errors.join('\n')}`);
  console.log(
    `icons: ${ICON_LAYERS.length} layers, 3 flat looks, Android adaptive, splash, ${alternates} alternates`,
  );
  return entries;
}
