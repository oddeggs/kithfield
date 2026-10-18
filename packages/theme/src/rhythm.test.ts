import { describe, expect, it } from 'vitest';

import { day, fruitColour, rhythmColours } from './index';
import { readDesign } from './test/design';

const rhythm = readDesign('07 Rhythm.dc.html').toLowerCase();
const guide = readDesign('15 Farm and Field Guide.dc.html').toLowerCase();

const shape = (value: unknown): unknown =>
  value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
    : 'leaf';

describe('the rhythm colours', () => {
  it('take the values the design writes by day', () => {
    const d = rhythmColours.day;
    for (const value of [d.recapCard, d.recapEyebrow, d.recapBody, d.recapBox, d.rose.bg, d.page]) {
      expect(rhythm, value).toContain(value.toLowerCase());
    }
    expect(guide).toContain(fruitColour('plum').toLowerCase());
    expect(d.hand).toBe(day.moss);
  });

  it('have a night value for every day one', () => {
    expect(shape(rhythmColours.night)).toEqual(shape(rhythmColours.day));
  });

  it('fall back to the gift plum for a fruit this app does not know', () => {
    expect(fruitColour('quince')).toBe(day.plum);
    expect(fruitColour(null)).toBe(day.plum);
  });
});
