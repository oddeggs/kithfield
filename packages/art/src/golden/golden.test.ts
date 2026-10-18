import { describe, expect, it } from 'vitest';

import { GOLDEN_MEAN_LIMIT } from './compare';
import { runGoldens } from './run';
import { GOLDEN_SCENES } from './scenes';

/**
 * Every golden scene drawn by the original renderer in headless Chrome and by the adapter on
 * CanvasKit must agree to within 2/255 on average. Needs Playwright's Chromium
 * (`pnpm --filter @kithfield/art exec playwright install chromium`).
 */
describe('golden scenes', () => {
  it('match the browser within 2/255 mean', { timeout: 300_000 }, async () => {
    const results = await runGoldens();
    expect(results).toHaveLength(GOLDEN_SCENES.length);
    const off = results
      .filter((r) => r.mean > GOLDEN_MEAN_LIMIT || r.errors.length > 0)
      .map((r) => `${r.scene.id}: mean ${r.mean.toFixed(3)} ${r.errors.join('; ')}`);
    expect(off).toEqual([]);
  });
});
