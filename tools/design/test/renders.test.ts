import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type RenderIndex } from '../src/manifest';

const rendersDir = join(import.meta.dirname, '../../../design/renders');
const indexPath = join(rendersDir, 'index.json');

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const head = readFileSync(path).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}

// The renders are generated, not committed: this checks a local render set when there is one.
describe.skipIf(!existsSync(indexPath))('the rendered set', () => {
  it('sizes every PNG at the index width and height times its scale', () => {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as RenderIndex;
    const wrong: string[] = [];
    for (const entry of Object.values(index.renders)) {
      const expected = [entry.width * entry.scale, entry.height * entry.scale];
      for (const file of [entry.file, ...Object.values(entry.variants)]) {
        const actual = pngSize(join(rendersDir, file));
        if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
          wrong.push(`${file}: ${actual.join('×')}, expected ${expected.join('×')}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
