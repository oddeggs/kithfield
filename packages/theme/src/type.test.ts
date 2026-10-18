import { describe, expect, it } from 'vitest';

import { between, captures, foundations, num } from './test/design';
import { type, typeKey, type Face, type TypeStyle, type Weight } from './type';

const ROW =
  /<div style="font:600 13px\/1\.2 -apple-system,system-ui">([^<]+)<\/div>\s*<div style="([^"]+)">[^<]*<\/div>\s*<div style="font:12\.5px\/1\.4[^"]*">([^<]+)<br>/g;

const SPEC =
  /^(Young Serif|Gaegu|SF Pro)(?: (Bold|Semibold))? ([\d.]+)(?: \/ ([\d.]+))?(?:, \+([\d.]+)% tracking)?(?: · (\w+)(?: \(([−-]\d+)\))?)?$/;

const FACES: Record<string, Face> = {
  'Young Serif': 'youngSerif',
  Gaegu: 'gaegu',
  'SF Pro': 'system',
};
const WEIGHTS: Record<string, Weight> = { '': 400, Semibold: 600, Bold: 700 };

/** One ramp row: the spec line is the source; the sample's CSS fills what the line leaves out. */
function parseRow(spec: string, sampleStyle: string): TypeStyle {
  const m = SPEC.exec(spec.trim());
  if (!m) throw new Error(`unreadable type spec: ${spec}`);
  const [, family = '', weightWord = '', size = '', lineHeight, tracking, textStyle, offset] = m;
  const sample = /font:(\d+) ([\d.]+)px\/([\d.]+)/.exec(sampleStyle);
  if (!sample) throw new Error(`unreadable sample: ${sampleStyle}`);
  const sizeN = num(size);
  return {
    face: FACES[family] ?? 'system',
    weight: WEIGHTS[weightWord] ?? 400,
    size: sizeN,
    lineHeight: lineHeight ? num(lineHeight) : sizeN * num(sample[3] ?? '1'),
    letterSpacing: tracking ? (sizeN * num(tracking)) / 100 : 0,
    uppercase: sampleStyle.includes('text-transform:uppercase'),
    textStyle: (textStyle || null) as TypeStyle['textStyle'],
    textStyleOffset: offset ? num(offset) : 0,
  };
}

const section = between(foundations(), 'id="type"', 'id="space"');
const rows = captures(section, ROW);

describe('type tokens match 01 Foundations', () => {
  it('reads the ramp from the design', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('has every ramp row with its face, weight, size, line height, tracking and text style', () => {
    const design = Object.fromEntries(
      rows.map(([name = '', sampleStyle = '', spec = '']) => [
        typeKey(name),
        parseRow(spec, sampleStyle),
      ]),
    );
    expect(type).toEqual(design);
  });

  it('draws each sample at the weight its spec names', () => {
    for (const [name = '', sampleStyle = ''] of rows) {
      const weight = Number(/font:(\d+)/.exec(sampleStyle)?.[1]);
      expect(type[typeKey(name) as keyof typeof type].weight, name).toBe(weight);
    }
  });
});

describe('typeKey', () => {
  it('turns ramp names into keys', () => {
    expect(typeKey('Display XL')).toBe('displayXL');
    expect(typeKey('Hand S')).toBe('handS');
    expect(typeKey('Row title')).toBe('rowTitle');
    expect(typeKey('Button')).toBe('button');
  });
});
