import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { gateFailures, goldenRunner, runGoldens, type GoldenRunner } from './run';
import { GOLDEN_SCENES } from './scenes';

/**
 * Every golden scene drawn by the original renderer in headless Chrome and by the adapter on
 * CanvasKit must agree: mean ≤ 2/255, worst 32-px tile ≤ 3 (≤ 8 where there is text), no missing
 * glyphs, no errors. Needs Playwright's Chromium; runs in its own CI job (`pnpm golden`).
 */
describe('golden scenes', () => {
  it('match the browser', { timeout: 600_000 }, async () => {
    const results = await runGoldens();
    expect(results).toHaveLength(GOLDEN_SCENES.length);
    const off = results.flatMap((r) => gateFailures(r).map((f) => `${r.scene.id}: ${f}`));
    expect(off).toEqual([]);
  });
});

describe('the gate', () => {
  let runner: GoldenRunner;
  beforeAll(async () => {
    runner = await goldenRunner();
  }, 120_000);
  afterAll(async () => {
    await runner.close();
  });

  const scene = (id: string) => {
    const s = GOLDEN_SCENES.find((x) => x.id === id);
    if (!s) throw new Error(`no golden scene ${id}`);
    return s;
  };

  it('fails a critter drawn asleep where the browser drew it awake', async () => {
    const r = await runner.compare(scene('critter-rabbit-awake'), scene('critter-rabbit-asleep'));
    expect(gateFailures(r)).not.toEqual([]);
  });

  it('fails English text drawn where the browser drew Vietnamese', async () => {
    const r = await runner.compare(scene('evening-vi'), scene('evening-en'));
    expect(gateFailures(r)).not.toEqual([]);
  });
});
