/**
 * Bakes a person's sticker pack for every app it leaves Kithfield for, from the art:
 *
 *   pnpm --filter @kithfield/art-tools bake-stickers --out <dir> [--pack mine] [--kind rabbit]
 *     [--coat …] [--mark …] [--outfit scarf] [--ocolor '#5e7f4a'] [--lang en] [--name June]
 *     [--only wave,hug]
 *
 * Writes `messages/<id>.png` (APNG, 408 px), `whatsapp/<id>.webp` (animated WebP, 512 px) with
 * `whatsapp/tray.png` and `whatsapp/pack.json` (the pasteboard payload WhatsApp reads), and
 * `telegram/<id>.webm` (VP9 with alpha, 512 px) with `telegram/icon.webm`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { exportOrder, packOf } from '@kithfield/art/stickers';
import { TELEGRAM, WHATSAPP } from '@kithfield/art/stickers';
import {
  checkFfmpeg,
  encodePng,
  encodeWebm,
  fitApng,
  fitWebp,
  scaleLoop,
  type WebpSettings,
} from './encode';
import { loopFrames } from './loop-length';
import { captionText, languageOf, renderLoop, stickerArt, stickerAttrs, type Look } from './render';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    pack: { type: 'string', default: 'mine' },
    kind: { type: 'string', default: 'rabbit' },
    coat: { type: 'string' },
    mark: { type: 'string' },
    outfit: { type: 'string' },
    ocolor: { type: 'string' },
    lang: { type: 'string', default: 'en' },
    name: { type: 'string', default: 'Kithfield' },
    only: { type: 'string' },
  },
});

if (!values.out) {
  console.error(
    'usage: bake-stickers --out <dir> [--pack] [--kind] [--outfit] [--ocolor] [--name]',
  );
  process.exit(2);
}
const pack = packOf(values.pack);
if (!pack) {
  console.error(`unknown pack ${values.pack}`);
  process.exit(2);
}

/** Emojis WhatsApp files each sticker under (it needs at least one). */
const EMOJI: Readonly<Record<string, readonly string[]>> = {
  wave: ['👋'],
  hug: ['🤗'],
  love: ['❤️'],
  heart_eyes: ['😍'],
  laugh: ['😂'],
  sleepy: ['😴'],
  thanks: ['🙏'],
  omw: ['🏃'],
  tumble: ['🏃'],
  yay: ['🎉'],
  care: ['🫂'],
  miss: ['🥺'],
  nope: ['🙅'],
  face: ['🥺'],
  peek: ['👀'],
  im_in: ['🙋'],
  in: ['🙋'],
  swing: ['👋'],
  duvet: ['😴'],
  star_eyes: ['🤩'],
  saw: ['👀'],
  balloon: ['🎈'],
  kite: ['🪁'],
  mail: ['💌'],
};

const out = resolve(process.env['INIT_CWD'] ?? process.cwd(), values.out);
const look: Look = {
  kind: values.kind,
  ...(values.coat ? { coat: values.coat } : {}),
  ...(values.mark ? { mark: values.mark } : {}),
  ...(values.outfit ? { outfit: values.outfit } : {}),
  ...(values.ocolor ? { ocolor: values.ocolor } : {}),
};
const lang = languageOf(values.lang);
for (const dir of ['messages', 'whatsapp', 'telegram'])
  mkdirSync(join(out, dir), { recursive: true });
await checkFfmpeg();

const { art, errors } = await stickerArt();
const only = values.only ? new Set(values.only.split(',')) : null;
const stickers = exportOrder(pack).filter((s) => !only || only.has(s.id));
/** WhatsApp: the best quality that fits, at the highest rate that fits. */
const WEBP_TRIES: readonly WebpSettings[] = [
  { quality: 75, alphaQuality: 80 },
  { quality: 60, alphaQuality: 70 },
  { quality: 45, alphaQuality: 60 },
  { quality: 35, alphaQuality: 50 },
];
/** Messages: palette qualities tried in turn. */
const APNG_QUALITIES = [70, 50, 35] as const;

/** Messages' regular sticker size. */
const MESSAGES_SIZE = 408;

const rows: string[][] = [
  ['sticker', 'frames', 'messages', 'q', 'fps', 'whatsapp', 'q', 'fps', 'telegram', 'crf'],
];
const packStickers: { image_data: string; emojis: readonly string[] }[] = [];
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const fps = 30;

for (const sticker of stickers) {
  const started = Date.now();
  const text = captionText(lang, sticker.caption);
  const attrs = stickerAttrs(look, sticker.pose, text);
  const count = loopFrames(sticker.pose);
  const loop = renderLoop(art, attrs, WHATSAPP.size, fps, count);

  const webp = await fitWebp(loop, WEBP_TRIES);
  writeFileSync(join(out, 'whatsapp', `${sticker.id}.webp`), webp.bytes);
  packStickers.push({
    image_data: Buffer.from(webp.bytes).toString('base64'),
    emojis: EMOJI[sticker.id] ?? ['🙂'],
  });

  const webm = await encodeWebm(loop, TELEGRAM.side, TELEGRAM.bytes);
  writeFileSync(join(out, 'telegram', `${sticker.id}.webm`), webm.bytes);

  const apng = await fitApng(await scaleLoop(loop, MESSAGES_SIZE), APNG_QUALITIES);
  writeFileSync(join(out, 'messages', `${sticker.id}.png`), apng.bytes);

  rows.push([
    sticker.id,
    String(count),
    kb(apng.bytes.length),
    String(apng.quality),
    String(apng.fps),
    kb(webp.bytes.length),
    `${webp.settings.quality}/${webp.settings.alphaQuality}`,
    String(webp.fps),
    kb(webm.bytes.length),
    String(webm.crf),
  ]);
  console.error(`${sticker.id}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

// The tray and the Telegram set's icon: the critter's face close-up, which the art draws below 70 px.
const first = stickers[0];
if (first) {
  const face = stickerAttrs(look, 'face', '');
  const tray = renderLoop(art, face, WHATSAPP.traySize, fps, 1).frames[0];
  if (tray) writeFileSync(join(out, 'whatsapp', 'tray.png'), await encodePng(tray));
  const icon = renderLoop(art, face, TELEGRAM.iconSide, fps, loopFrames('face'));
  const iconWebm = await encodeWebm(icon, TELEGRAM.iconSide, TELEGRAM.iconBytes);
  writeFileSync(join(out, 'telegram', 'icon.webm'), iconWebm.bytes);
}

const trayBytes = readFileSync(join(out, 'whatsapp', 'tray.png'));
const name = `${values.name} by Kithfield`;
const payload = {
  identifier: `kithfield.${pack.id}.${values.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  name,
  publisher: 'Kithfield',
  tray_image: trayBytes.toString('base64'),
  animated_sticker_pack: true,
  ios_app_store_link: '',
  android_play_store_link: '',
  stickers: packStickers,
};
const json = JSON.stringify(payload);
writeFileSync(join(out, 'whatsapp', 'pack.json'), json);

const widths = rows[0]?.map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length))) ?? [];
for (const r of rows) console.log(r.map((v, c) => v.padEnd(widths[c] ?? 0)).join('  '));
console.log(`whatsapp/pack.json: ${kb(json.length)} for ${packStickers.length} stickers`);
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`wrote ${out}`);
