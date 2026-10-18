/**
 * Checks a baked pack against each app's rules:
 *
 *   pnpm --filter @kithfield/art-tools check-stickers <dir>
 *
 * Reads `<dir>/whatsapp/*.webp` (+ `tray.png`), `<dir>/telegram/*.webm` (+ `icon.webm`) and
 * `<dir>/messages/*.png`, prints each file's problems and exits 1 if any file has one.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  checkMessagesSticker,
  checkTelegramIcon,
  checkTelegramSticker,
  checkWhatsAppPack,
  checkWhatsAppSticker,
  checkWhatsAppTray,
  type Problem,
} from '../../../apps/mobile/src/features/stickers/formats/specs';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: check-stickers <dir>');
  process.exit(2);
}
const root = resolve(process.env['INIT_CWD'] ?? process.cwd(), dir);

let failed = 0;
let checked = 0;

function report(file: string, problems: readonly Problem[]): void {
  checked++;
  if (problems.length === 0) {
    console.log(`ok    ${file}`);
    return;
  }
  failed++;
  for (const p of problems) console.log(`FAIL  ${file}  [${p.rule}] ${p.message}`);
}

function files(sub: string, ext: string): string[] {
  const d = join(root, sub);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith(ext))
    .sort();
}

const read = (sub: string, f: string) => new Uint8Array(readFileSync(join(root, sub, f)));

const whatsapp = files('whatsapp', '.webp');
for (const f of whatsapp) report(`whatsapp/${f}`, checkWhatsAppSticker(read('whatsapp', f)));
if (whatsapp.length > 0) {
  report('whatsapp (pack)', checkWhatsAppPack(whatsapp.length));
  report(
    'whatsapp/tray.png',
    existsSync(join(root, 'whatsapp', 'tray.png'))
      ? checkWhatsAppTray(read('whatsapp', 'tray.png'))
      : [{ rule: 'whatsapp.tray', message: 'missing' }],
  );
}

const telegram = files('telegram', '.webm');
for (const f of telegram) {
  const bytes = read('telegram', f);
  report(
    `telegram/${f}`,
    f === 'icon.webm' ? checkTelegramIcon(bytes) : checkTelegramSticker(bytes),
  );
}

for (const f of files('messages', '.png')) {
  report(`messages/${f}`, checkMessagesSticker(read('messages', f)));
}

console.log(`${checked} checked, ${failed} with problems`);
if (checked === 0 || failed > 0) process.exit(1);
