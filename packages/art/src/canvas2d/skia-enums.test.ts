import { describe, expect, it } from 'vitest';

import { requireFromSkia, SKIA_TYPES_PATH } from '../node/skia';
import * as ours from './skia-enums';

/** React Native Skia's own enums, from the build the app ships. */
const theirs = requireFromSkia<Record<string, Record<string, number>>>(SKIA_TYPES_PATH);

const pairs: [keyof typeof ours, string][] = [
  ['BlendMode', 'BlendMode'],
  ['PaintStyle', 'PaintStyle'],
  ['StrokeCap', 'StrokeCap'],
  ['StrokeJoin', 'StrokeJoin'],
  ['ClipOp', 'ClipOp'],
  ['FillType', 'FillType'],
  ['TileMode', 'TileMode'],
  ['FilterMode', 'FilterMode'],
  ['MipmapMode', 'MipmapMode'],
  ['PathVerb', 'PathVerb'],
  ['FontEdging', 'FontEdging'],
  ['FontHinting', 'FontHinting'],
  ['ColorType', 'ColorType'],
  ['AlphaType', 'AlphaType'],
  ['ImageFormat', 'ImageFormat'],
];

describe('the Skia enum values declared here', () => {
  it.each(pairs)('%s matches React Native Skia', (mine, name) => {
    const values = ours[mine] as Record<string, number>;
    const source = theirs[name];
    expect(source, `${name} is not exported by React Native Skia`).toBeDefined();
    for (const [key, value] of Object.entries(values))
      expect([key, source?.[key]]).toEqual([key, value]);
  });
});
