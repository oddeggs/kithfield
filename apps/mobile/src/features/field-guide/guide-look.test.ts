import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { motion } from '@kithfield/theme';

import { guideMotion, scrapCardHeight } from './guide-look';

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

  it('sets text by the type ramp, in the reader’s language, never by size alone', () => {
    expect(offending(/\b(fontSize|lineHeight)\s*:/)).toEqual([]);
  });

  it('times every move by the theme’s motion', () => {
    // A bare number of milliseconds; a multiple of a theme token is fine.
    expect(offending(/\b(\w*Ms|\w*_MS|duration|delay)\s*[:=(]\s*[1-9][\d.]*\s*([,;)}]|$)/)).toEqual(
      [],
    );
  });

  it('cross-fades the rows on a season tab as the theme cross-fades a swap', () => {
    expect(guideMotion.rowsFade).toBe(motion.cross);
  });

  it('holds each of a rare bloom’s drawings for three frames on twos', () => {
    expect(guideMotion.bloomHoldMs).toBe(3 * motion.twos.frameMs);
  });

  it('stands a scrapbook card as tall as the design lays it out', () => {
    // Measured in the design: a pressed card with a three-line note, a dashed one with two.
    expect(scrapCardHeight.pressed).toBeCloseTo(224.56, 1);
    expect(scrapCardHeight.waiting).toBeCloseTo(194.38, 1);
  });
});
