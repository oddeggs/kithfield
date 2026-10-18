import { describe, expect, it } from '@jest/globals';

import { countryOf, hemisphereOf, localDay, seasonNow } from './calendar';

describe('the phone calendar', () => {
  it('takes the hemisphere from the region setting', () => {
    expect(hemisphereOf('AU')).toBe('south');
    expect(hemisphereOf('nz')).toBe('south');
    expect(hemisphereOf('VN')).toBe('north');
    expect(hemisphereOf(null)).toBe('north');
  });

  it('sends a two-letter country for the age check', () => {
    expect(countryOf('vn')).toBe('VN');
    expect(countryOf(undefined)).toBe('ZZ');
    expect(countryOf('419')).toBe('ZZ');
  });

  it('draws the season outside', () => {
    const october = new Date(2026, 9, 18);
    expect(localDay(october)).toBe('2026-10-18');
    expect(seasonNow(october, 'GB')).toBe('autumn');
    expect(seasonNow(october, 'AU')).toBe('spring');
  });
});
