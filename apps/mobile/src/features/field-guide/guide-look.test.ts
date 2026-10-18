import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The guide's own source files, tests left out. */
const sources = readdirSync(__dirname)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test(-data)?\.tsx?$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(join(__dirname, f), 'utf8') }));

const offending = (pattern: RegExp) =>
  sources.flatMap(({ file, text }) =>
    text.split('\n').flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}`] : [])),
  );

describe('the field guide look', () => {
  it('takes every colour and shadow from the theme', () => {
    expect(offending(/#[0-9a-f]{3,8}\b|rgba?\(|\d+px/i)).toEqual([]);
  });
});
