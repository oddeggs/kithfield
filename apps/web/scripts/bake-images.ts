/**
 * Bakes the site's images with the art package's Node renderer (the same drawings the page draws
 * live): the link-preview cards, the icons and the press kit. Runs before `astro build`; the files
 * land in `public/` and are not committed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { bakeScene, createNodeArt, encodePng } from '@kithfield/art/node';
import { t, type Language } from '@kithfield/i18n';
import { Species } from '@kithfield/contracts';

import { homeCard, inviteCard } from './og-card';
import { zip, type ZipEntry } from './zip';

const publicDir = join(import.meta.dirname, '..', 'public');
const errors: string[] = [];
const art = await createNodeArt({ onError: (message) => errors.push(message) });

function write(path: string, bytes: Uint8Array): void {
  const out = join(publicDir, path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
}

const faces: Record<Language, { serif: string; hand: string }> = {
  en: { serif: "'Young Serif', Georgia, serif", hand: 'Gaegu, cursive' },
  vi: { serif: "'Lora', Georgia, serif", hand: "'Patrick Hand', cursive" },
};

for (const lang of ['en', 'vi'] as const) {
  write(
    `og/home-${lang}.png`,
    homeCard(art, faces[lang], {
      brand: t(lang, 'website.brand'),
      title: t(lang, 'website.og.homeTitle'),
      line: t(lang, 'website.og.homeLine'),
    }),
  );
  write(
    `og/invite-${lang}.png`,
    inviteCard(art, faces[lang], {
      from: t(lang, 'website.og.inviteFrom'),
      title: t(lang, 'website.og.inviteTitle'),
    }),
  );
}

const icon = (size: number): Uint8Array =>
  bakeScene(art, { scene: 'appicon', width: size, height: size, dpr: 1 }, 0);
write('favicon-32.png', icon(32));
write('apple-touch-icon.png', icon(180));

// The press kit: the icon at 1024 px and every critter at 2× and 4×, zipped as one download.
const press: ZipEntry[] = [{ name: 'kithfield-app-icon-1024.png', data: icon(1024) }];
write('press/app-icon-1024.png', press[0]?.data ?? new Uint8Array());
for (const kind of Species.options) {
  for (const scale of [2, 4]) {
    const data = bakeScene(
      art,
      { scene: 'pose', width: 256, height: 256, dpr: scale, attrs: { kind, pose: 'awake' } },
      4.5,
    );
    press.push({ name: `critters/${kind}@${scale}x.png`, data });
  }
}
// The wordmark, set in Young Serif on the adapter, at 2× and 4×.
for (const scale of [2, 4]) {
  const canvas = art.canvas(360 * scale, 96 * scale);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No 2D context');
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.font = "400 64px 'Young Serif', Georgia, serif";
  c.fillStyle = '#2a221d';
  c.textBaseline = 'middle';
  c.fillText(t('en', 'website.brand'), 16, 50);
  press.push({ name: `kithfield-wordmark@${scale}x.png`, data: encodePng(canvas) });
}
write('press/kithfield-press-kit.zip', zip(press));

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Baked the link previews, icons and press kit (${press.length} files) into public/`);
