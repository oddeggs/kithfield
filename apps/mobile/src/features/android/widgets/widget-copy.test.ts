import { describe, expect, it } from '@jest/globals';

import { planHour, planLabel, widgetCopy } from './widget-copy';

describe('the widgets’ words', () => {
  it('lists names as the iOS widgets do', () => {
    const { list } = widgetCopy('en');
    expect(list([])).toBe('');
    expect(list(['Pip'])).toBe('Pip');
    expect(list(['Pip', 'Bea'])).toBe('Pip and Bea');
    expect(list(['Pip', 'Fig', 'Bea'])).toBe('Pip, Fig and Bea');
    expect(widgetCopy('vi').list(['Pip', 'Bea'])).toBe('Pip và Bea');
  });

  it('says a plan’s hour the way each language does', () => {
    expect(planHour('16:00', 'en')).toBe('4pm');
    expect(planHour('09:30', 'en')).toBe('9:30am');
    expect(planHour('00:00', 'en')).toBe('12am');
    expect(planHour('16:00', 'vi')).toBe('16:00');
  });

  it('names a plan’s day, with its hour when it has one', () => {
    expect(planLabel('2026-10-24', '16:00', 'en')).toBe('Saturday · 4pm');
    expect(planLabel('2026-10-24', null, 'en')).toBe('Saturday');
  });
});
