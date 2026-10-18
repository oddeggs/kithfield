import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { day, night } from '@kithfield/theme';

const swift = readFileSync(
  join(__dirname, '../../../targets/_shared/SurfacePalette.swift'),
  'utf8',
);

describe('the extensions’ colours', () => {
  it('are the theme’s, by token', () => {
    const pairs = [
      ...swift.matchAll(
        /theme: (day|night)\.(\w+)\n\s+static let \w+ = Color\(hex: 0x([0-9A-F]{6})\)/g,
      ),
    ];
    expect(pairs.length).toBeGreaterThan(8);
    for (const [, palette, token, hex] of pairs) {
      const tokens: Record<string, string> = palette === 'day' ? day : night;
      expect(`#${hex}`).toBe(tokens[token ?? '']);
    }
  });
});
