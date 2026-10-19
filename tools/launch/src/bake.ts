/**
 * Bakes the launch assets from the art and the design export:
 *
 *   pnpm --filter @kithfield/launch bake [-- --only <prefix>,<prefix>] [--season spring]
 *
 * `--only` takes asset id prefixes: `icons`, `ios`, `ios.vi`, `android`, `marketing`, `clips`,
 * `iap`. Icons and the splash go into the app (`apps/mobile/assets`); everything else into `store/`
 * with its entry in `store/manifest.json`. See tools/launch/README.md.
 */
import { parseArgs } from 'node:util';

import { openBoards } from './board';
import { bakeBoards } from './bake-boards';
import { bakeClips } from './bake-clips';
import { bakeIapReview } from './bake-iap';
import { bakeIcons } from './bake-icons';
import { type ManifestEntry, mergeManifest } from './manifest';
import { BOARD_JOBS, CLIP_JOBS } from './specs';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    only: { type: 'string' },
    season: { type: 'string', default: 'spring' },
  },
});

const prefixes = (values.only ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);
const wanted = (id: string): boolean =>
  prefixes.length === 0 || prefixes.some((p) => id === p || id.startsWith(`${p}.`));

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
if (!SEASONS.includes(values.season)) throw new Error(`--season is one of ${SEASONS.join(', ')}`);
const tweaks = { season: values.season, motion: true };

const started = Date.now();
const entries: ManifestEntry[] = [];

if (wanted('icons')) entries.push(...(await bakeIcons()));

const boardJobs = BOARD_JOBS.filter((job) => wanted(job.id));
const clipJobs = CLIP_JOBS.filter((job) => wanted(job.id) || wanted('clips'));
const iap = wanted('iap');
if (boardJobs.length > 0 || clipJobs.length > 0 || iap) {
  const boards = await openBoards();
  try {
    if (boardJobs.length > 0) entries.push(...(await bakeBoards(boards, boardJobs, tweaks)));
    if (clipJobs.length > 0) entries.push(...(await bakeClips(boards, clipJobs, tweaks)));
    if (iap) entries.push(...(await bakeIapReview(boards)));
  } finally {
    await boards.close();
  }
}

await mergeManifest(entries);
console.log(
  `\n${entries.length} assets in ${((Date.now() - started) / 1000).toFixed(0)}s → store/manifest.json`,
);
