/**
 * Writes each embedded font's own line height into `@kithfield/theme`, which the app uses to give
 * text set tighter than its face the room iOS would otherwise clip. Run it after `download`; with
 * `--check`, only fails when the committed module no longer matches the fonts.
 *
 *   pnpm --filter @kithfield/fonts metrics
 *   pnpm --filter @kithfield/fonts metrics:check
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { metricsModule, metricsModulePath } from './font-metrics';

const { values } = parseArgs({ options: { check: { type: 'boolean' } } });
for (const [path, source] of [[metricsModulePath, metricsModule()]] as const) {
  if (values.check) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (current !== source) {
      console.error(`${path} is stale: run pnpm --filter @kithfield/fonts metrics`);
      process.exitCode = 1;
    } else console.log(`${path} matches the fonts`);
  } else {
    writeFileSync(path, source);
    console.log(`wrote ${path}`);
  }
}
