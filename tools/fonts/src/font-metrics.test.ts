import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { metricsModule, metricsModulePath, naturalLineHeight } from './font-metrics';
import type { LineMetrics } from './sfnt';

const metrics = (over: Partial<LineMetrics> = {}): LineMetrics => ({
  unitsPerEm: 1000,
  hhea: { ascender: 1042, descender: -312, lineGap: 0 },
  typo: { ascender: 1024, descender: -312, lineGap: 0 },
  useTypoMetrics: false,
  ...over,
});

describe('font line heights', () => {
  it('are committed as the fonts give them, so a font change cannot leave them stale', () => {
    expect(readFileSync(metricsModulePath, 'utf8')).toBe(metricsModule());
  });

  it('come from hhea, line gap included', () => {
    expect(naturalLineHeight(metrics())).toBeCloseTo(1.354, 6);
    const gaegu = { ascender: 760, descender: -240, lineGap: 250 };
    expect(naturalLineHeight(metrics({ hhea: gaegu, typo: gaegu }))).toBe(1.25);
  });

  it('ignore USE_TYPO_METRICS, as Core Text does', () => {
    const typo = { ascender: 1400, descender: -312, lineGap: 0 };
    expect(naturalLineHeight(metrics({ typo, useTypoMetrics: true }))).toBeCloseTo(1.354, 6);
  });

  it('fall back to the typo metrics when hhea has none', () => {
    const hhea = { ascender: 0, descender: 0, lineGap: 0 };
    const typo = { ascender: 1400, descender: -312, lineGap: 0 };
    expect(naturalLineHeight(metrics({ hhea, typo }))).toBeCloseTo(1.712, 6);
  });

  it('match what Core Text measures for the embedded fonts', () => {
    const source = metricsModule();
    for (const [name, value] of [
      ['YoungSerif-Regular', 1.412],
      ['Gaegu-Bold', 1.25],
      ['PatrickHand-Regular', 1.354],
      ['Lora-SemiBold', 1.28],
    ] as const)
      expect(source).toContain(`'${name}': ${value},`);
  });
});
