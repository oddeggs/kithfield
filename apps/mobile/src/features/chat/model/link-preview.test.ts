import { describe, expect, it } from '@jest/globals';

import { firstUrl, parsePreview } from './link-preview';

describe('link previews', () => {
  it('finds the first web address in a message', () => {
    expect(firstUrl('look: https://hollowcreek.org/swap.')).toBe('https://hollowcreek.org/swap');
    expect(firstUrl('(see http://a.b/c)')).toBe('http://a.b/c');
    expect(firstUrl('no link here')).toBeNull();
  });

  it('reads Open Graph tags, falling back to the title', () => {
    const html = `<html><head><title>Ignored</title>
      <meta property="og:title" content="Willow Bend &amp; picnic meadow">
      <meta name="description" content='Shady, near the stepping stones'>
      </head></html>`;
    expect(parsePreview(html, 'https://www.hollowcreekparks.org/w')).toEqual({
      title: 'Willow Bend & picnic meadow',
      description: 'Shady, near the stepping stones',
      site: 'hollowcreekparks.org',
    });
    expect(parsePreview('<title> Seed swap </title>', 'https://x.org')).toEqual({
      title: 'Seed swap',
      site: 'x.org',
    });
  });
});
