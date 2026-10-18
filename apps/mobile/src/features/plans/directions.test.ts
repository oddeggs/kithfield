import { describe, expect, it } from '@jest/globals';

import { directionsUrl } from './directions';

describe('directions to a hangout', () => {
  it('asks Maps for the way to the place by its words, from wherever Maps finds the person', () => {
    const url = new URL(directionsUrl({ name: 'Willow bend', address: 'Hollow Creek' }));
    expect(url.origin).toBe('https://maps.apple.com');
    expect(url.searchParams.get('daddr')).toBe('Willow bend, Hollow Creek');
    expect(url.searchParams.has('saddr')).toBe(false);
  });

  it('uses the place’s coordinates when it has them', () => {
    const url = new URL(directionsUrl({ name: 'Willow bend', lat: 51.5, lng: -0.12 }));
    expect(url.searchParams.get('daddr')).toBe('51.5,-0.12');
  });
});
