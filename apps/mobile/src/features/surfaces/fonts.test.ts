import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { hand } from '@kithfield/theme';

import { FONTS } from '../../../app.config';

const swift = readFileSync(join(__dirname, '../../../targets/_shared/SurfaceFonts.swift'), 'utf8');

describe('the extensions’ hand face', () => {
  it('is the theme’s, registered from the app’s bundle by its file', () => {
    expect(swift).toContain(`static let handName = "${hand.name}"`);
    expect(FONTS).toContain(`../../packages/theme/fonts/${hand.name}.ttf`);
    expect(swift).not.toMatch(/"(Gaegu|PatrickHand|YoungSerif)/);
  });
});
