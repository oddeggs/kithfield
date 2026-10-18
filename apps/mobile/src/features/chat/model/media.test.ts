import { describe, expect, it } from '@jest/globals';

import { byMonth, sharedItems, siteOf, viewable } from './media';
import type { LogEvent } from './timeline';

const ref = (mime: string, n: number) => ({
  key: `farm/f/00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  mime,
  bytes: 10,
});
const ev = (seq: number, at: number, kind: string, payload: unknown): LogEvent => ({
  seq,
  opId: `op-${seq}`,
  at,
  actor: 'fig',
  kind,
  payload,
  known: true,
});

describe('shared media', () => {
  const sep = Date.UTC(2026, 8, 10, 12);
  const oct = Date.UTC(2026, 9, 10, 12);
  const events = [
    ev(2, sep, 'media', { items: [ref('image/jpeg', 1), ref('video/mp4', 2)] }),
    ev(3, oct, 'link', {
      url: 'https://www.hollowcreek.org/swap',
      preview: { title: 'Seed swap' },
    }),
    ev(4, oct, 'voice', { audio: ref('audio/mp4', 3), durationMs: 2000, waveform: [] }),
    ev(5, oct, 'media', { items: [ref('image/png', 4)] }),
    ev(6, oct, 'unsend', { target: 5, by: 'author' }),
  ];

  it('lists each item once, newest first, without what was unsent', () => {
    const items = sharedItems(events);
    expect(items.map((i) => [i.seq, i.index, i.tab])).toEqual([
      [4, 0, 'voice'],
      [3, 0, 'links'],
      [2, 0, 'photos'],
      [2, 1, 'videos'],
    ]);
    expect(items[1]).toMatchObject({ site: 'hollowcreek.org', title: 'Seed swap' });
  });

  it('groups by month, newest month first', () => {
    const groups = byMonth(sharedItems(events), 'UTC');
    expect(groups.map((g) => [g.month, g.items.length])).toEqual([
      ['2026-10', 2],
      ['2026-09', 2],
    ]);
  });

  it('pages photos and videos in the viewer oldest first', () => {
    expect(viewable(sharedItems(events)).map((i) => [i.seq, i.index])).toEqual([
      [2, 1],
      [2, 0],
    ]);
    expect(siteOf('http://example.com:8080/x')).toBe('example.com');
  });
});
