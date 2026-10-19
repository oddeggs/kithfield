// Fills the local secrets `wrangler dev` needs into `apps/api/.dev.vars` (ignored by git), so the
// local API answers what the deployed one does: sessions, the waitlist, the farm's invite link
// (`GET /v1/farms/:id/invite`), the keepsakes export and media all answer 503 without their key.
// A key already set to 32 characters or more is kept; a missing or short one gets a fresh random
// value. The media Worker gets the same MEDIA_SIGNING_KEY. Only names are printed, never values.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The secrets the local API can't work without, each at least 32 characters. */
const NEEDED = [
  'BETTER_AUTH_SECRET',
  'WAITLIST_EMAIL_KEY',
  'INVITE_CODE_KEY',
  'EXPORT_URL_KEY',
  'MEDIA_SIGNING_KEY',
];
const MIN = 32;

const apps = join(import.meta.dirname, '..', '..');

/** Reads `KEY=value` lines; comments and blank lines are kept as they are. */
const read = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8').split('\n')
    : ['# Local secrets for `wrangler dev`; .dev.vars.example names the others.', ''];

const valueOf = (lines, name) => {
  const line = lines.find((l) => l.startsWith(`${name}=`));
  return line === undefined ? undefined : line.slice(name.length + 1).trim();
};

const set = (lines, name, value) => {
  const at = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (at === -1) {
    const end =
      lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
    lines.splice(end, 0, `${name}=${value}`);
  } else {
    lines[at] = `${name}=${value}`;
  }
};

const write = (file, lines) => writeFileSync(file, lines.join('\n'), { mode: 0o600 });

const apiFile = join(apps, 'api', '.dev.vars');
const api = read(apiFile);
const filled = [];
for (const name of NEEDED) {
  const value = valueOf(api, name);
  if (value !== undefined && value.length >= MIN) continue;
  set(api, name, randomBytes(32).toString('base64url'));
  filled.push(name);
}
write(apiFile, api);

const mediaFile = join(apps, 'media-worker', '.dev.vars');
const media = read(mediaFile);
const signing = valueOf(api, 'MEDIA_SIGNING_KEY');
if (signing !== undefined && valueOf(media, 'MEDIA_SIGNING_KEY') !== signing) {
  set(media, 'MEDIA_SIGNING_KEY', signing);
  write(mediaFile, media);
  filled.push('MEDIA_SIGNING_KEY (media Worker)');
}

console.log(
  filled.length === 0
    ? `.dev.vars: ${NEEDED.join(', ')} already set`
    : `.dev.vars: filled ${filled.join(', ')}`,
);
