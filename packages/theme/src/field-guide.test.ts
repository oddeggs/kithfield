import { describe, expect, it } from 'vitest';

import { fieldGuideColours, fieldGuideWashes } from './index';
import { readDesign } from './test/design';

const html = readDesign('15 Farm and Field Guide.dc.html').toLowerCase();
/** As the export writes values: lower case, no space after a comma. */
const asWritten = (value: string) => value.toLowerCase().replace(/,\s+/g, ',');

const leaves = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(leaves)
      : [];

const shape = (value: unknown): unknown =>
  value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
    : 'leaf';

describe('the field guide colours', () => {
  it('take every day colour and shadow from the design', () => {
    for (const value of leaves(fieldGuideColours.day)) expect(html).toContain(asWritten(value));
  });

  it('give every job a night colour too', () => {
    expect(shape(fieldGuideColours.night)).toEqual(shape(fieldGuideColours.day));
  });

  it('wash a rare bloom in rain as the design paints it', () => {
    expect(html).toContain(`background:${fieldGuideWashes.rare.rain_kissed}`);
  });
});
