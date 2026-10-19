import { describe, expect, it } from 'vitest';

import { parseListing, readListing, storeLength } from './listing';

describe('the store listing', () => {
  for (const language of ['en', 'vi'] as const) {
    it(`fits every field's store limit (${language})`, () => {
      const fields = readListing(language);
      for (const required of ['Name', 'Subtitle', 'Promotional text', 'Keywords', 'Description']) {
        expect(fields.map((f) => f.field)).toContain(required);
      }
      for (const { field, limit, text } of fields) {
        expect({ field, length: storeLength(text) <= limit }).toEqual({ field, length: true });
        expect(text.length).toBeGreaterThan(0);
      }
    });

    it(`keeps keywords as one comma-separated list without spaces after commas (${language})`, () => {
      const keywords = readListing(language).find((f) => f.field === 'Keywords')?.text ?? '';
      expect(keywords).not.toMatch(/,\s/);
      expect(keywords.split(',').every((k) => k.trim() === k && k.length > 0)).toBe(true);
    });

    it(`never promises what the house rules forbid (${language})`, () => {
      const text = readListing(language)
        .map((f) => f.text)
        .join('\n')
        .toLowerCase();
      expect(text).not.toMatch(/#1|number one|best app|free trial|streak bonus|daily streak/);
    });
  }

  it('counts a Vietnamese letter with its marks as one character', () => {
    expect(storeLength('Việt')).toBe(4);
    expect(storeLength('Việt')).toBe(4);
  });

  it('reads a field that points at the App Store description as that description', () => {
    const fields = parseListing(
      [
        '### Description (4000)',
        '',
        'Stay close.',
        '',
        '### Full description (4000)',
        '',
        'The App Store description above, unchanged.',
      ].join('\n'),
    );
    expect(fields[1]).toEqual({ field: 'Full description', limit: 4000, text: 'Stay close.' });
  });
});
