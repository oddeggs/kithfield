import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { LIT_WINDOW_MS } from '@kithfield/contracts';

import { HOMES, imageNames, litMask, tag } from './names';

const swift = readFileSync(join(__dirname, '../../../targets/_shared/SurfaceNames.swift'), 'utf8');

describe('the surfaces’ image names', () => {
  it('tag ids as the server does, so it can name a critter’s still', () => {
    expect(tag('person-1')).toBe('5v9g1o0ndk');
    expect(imageNames.critter('person-1')).toBe('critter-5v9g1o0ndk.png');
  });

  it('light homes by bits in the scene’s order', () => {
    expect(litMask([])).toBe(0);
    expect(litMask(['rabbit', 'sheep', 'otter'])).toBe(0b10001);
    expect(litMask(['owl'])).toBe(0b100000);
  });

  it('match the extensions’ names and rules', () => {
    expect(swift).toContain(`static let homes = [${HOMES.map((h) => `"${h}"`).join(', ')}]`);
    expect(swift).toContain('static let litWindowMs: Double = 3 * 60 * 60 * 1000');
    expect(3 * 60 * 60 * 1000).toBe(LIT_WINDOW_MS);
    const pairs: [string, string][] = [
      [imageNames.medium('F', 5), '"widget-\\(tag(farm))-\\(mask(lit)).png"'],
      [imageNames.large('F', 5), '"widgetl-\\(tag(farm))-\\(mask(lit)).png"'],
      [imageNames.mediumFire('F'), '"widgetfire-\\(tag(farm)).png"'],
      [imageNames.smallFire('autumn'), '"firesmall-\\(season).png"'],
      [imageNames.fireRoom('autumn'), '"fireroom-\\(season).png"'],
      [imageNames.walk('autumn'), '"walk-\\(season).png"'],
      [imageNames.critter('P'), '"critter-\\(tag(person)).png"'],
      [imageNames.seed, '"seed.png"'],
    ];
    for (const [name, pattern] of pairs) {
      expect(swift).toContain(pattern);
      expect(name).toMatch(/^[a-z0-9_-]{1,80}\.png$/);
    }
  });
});
