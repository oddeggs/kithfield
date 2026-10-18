import { describe, expect, it } from 'vitest';

import {
  fileSlug,
  parseLabel,
  renderFileName,
  scaleForWidth,
  slugify,
  titleSlug,
  uniqueSlugs,
} from '../src/naming';
import { fileSelected, idSelected, labelsInSource, parseOnly } from '../src/select';

describe('screen labels', () => {
  it('takes the leading token as the id and the rest as the title', () => {
    expect(parseLabel('04-01 Farm home (try the season and night tweaks)')).toEqual({
      id: '04-01',
      title: 'Farm home (try the season and night tweaks)',
    });
  });

  it('accepts a bare id and collapses whitespace in the title', () => {
    expect(parseLabel('  17-01  ')).toEqual({ id: '17-01', title: '' });
    expect(parseLabel('12-12 Vietnamese\n  screen')).toEqual({
      id: '12-12',
      title: 'Vietnamese screen',
    });
  });

  it('rejects an empty label', () => {
    expect(parseLabel('   ')).toBeNull();
  });

  it('reads labels from a source as written', () => {
    const html =
      '<div data-screen-label="03-01 Welcome"></div><div data-screen-label="03-02 Pick"></div>';
    expect(labelsInSource(html)).toEqual(['03-01 Welcome', '03-02 Pick']);
  });
});

describe('slugs and file names', () => {
  it('slugs file names and titles to lower-case ascii', () => {
    expect(fileSlug('17 Landing VI.dc.html')).toBe('17-landing-vi');
    expect(fileSlug('01 Foundations.dc.html')).toBe('01-foundations');
    expect(slugify('Đêm nay, ở trang trại!')).toBe('dem-nay-o-trang-trai');
    expect(slugify('Spacing and radii')).toBe('spacing-and-radii');
  });

  it('keeps title slugs to their first words', () => {
    expect(titleSlug('All art is drawn live in code with hand-drawn canvas techniques')).toBe(
      'all-art-is-drawn-live-in',
    );
    expect(titleSlug('colour')).toBe('colour');
  });

  it('numbers repeated slugs instead of overwriting', () => {
    expect(uniqueSlugs(['intro', 'colour', 'intro', ''])).toEqual([
      'intro',
      'colour',
      'intro-2',
      'section',
    ]);
  });

  it('names defaults and variants', () => {
    expect(renderFileName('04-01')).toBe('04-01.png');
    expect(renderFileName('04-01', 'winter.night')).toBe('04-01.winter.night.png');
    expect(renderFileName('01-foundations/colour', 'summer')).toBe(
      '01-foundations/colour.summer.png',
    );
  });

  it('renders phone frames at 3x and wider frames at 2x', () => {
    expect(scaleForWidth(393)).toBe(3);
    expect(scaleForWidth(500)).toBe(3);
    expect(scaleForWidth(1280)).toBe(2);
  });
});

describe('--only filters', () => {
  const tokens = parseOnly(' 04-01, 16 ,01-foundations,');

  it('splits and trims the list', () => {
    expect(tokens).toEqual(['04-01', '16', '01-foundations']);
    expect(parseOnly(undefined)).toEqual([]);
  });

  it('selects screens by id or file number', () => {
    expect(idSelected('04-01', tokens)).toBe(true);
    expect(idSelected('04-010', tokens)).toBe(false);
    expect(idSelected('16-12', tokens)).toBe(true);
    expect(idSelected('04-02', tokens)).toBe(false);
  });

  it('selects whole files by number or slug', () => {
    expect(fileSelected('16-fire-room-and-calls', tokens)).toBe(true);
    expect(fileSelected('01-foundations', tokens)).toBe(true);
    expect(fileSelected('04-farm-and-chat', tokens)).toBe(false);
    expect(fileSelected('17-landing-vi', parseOnly('17'))).toBe(true);
  });

  it('selects everything with no filter', () => {
    expect(fileSelected('02-cast', [])).toBe(true);
    expect(idSelected('02-01', [])).toBe(true);
  });
});
