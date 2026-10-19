import { describe, expect, it } from 'vitest';

import { fieldGuideColours, fieldGuideMotion, fieldGuideWashes } from './index';
import { readDesign, textOf } from './test/design';

const design = readDesign('15 Farm and Field Guide.dc.html');
const html = design.toLowerCase();
const notes = textOf(design);
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

  it('wash a plant page’s hero as the design paints it', () => {
    expect(fieldGuideWashes.hero).toBe('#efe4f3');
    expect(html).toContain(`height:360px;background:${fieldGuideWashes.hero}`);
  });

  it('wash a rare bloom in rain as the design paints it', () => {
    expect(html).toContain(`background:${fieldGuideWashes.rare.rain_kissed}`);
  });
});

describe('the field guide motion', () => {
  it('takes the sway and the basket’s pace from the developer notes', () => {
    const { sway, potSway, basketStepMs } = fieldGuideMotion;
    expect(notes).toContain(`sways ±${sway.degrees}° on a ${sway.periodMs / 1000}s loop`);
    expect(notes).toContain(`pot sways ±${potSway.degrees}°`);
    expect(notes).toContain(`one crop at a time, ${basketStepMs}ms apart`);
  });
});
