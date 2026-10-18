import { describe, expect, it } from '@jest/globals';

import { slowPostsTo, umbrellaBrought, warmthFrom } from './care';
import { fitsUpload, sizeOf, sortOf } from './files';
import type { LogEvent } from './message';
import {
  bouquetParts,
  repliesFor,
  splitQuickTend,
  writeOf,
  type QuickTendItem,
} from './quick-tend';

const ev = (
  seq: number,
  kind: string,
  actor: string | null,
  payload: unknown,
  extra: Partial<LogEvent> = {},
): LogEvent => ({ seq, at: 0, actor, kind, payload, ...extra });

describe('heavy weather', () => {
  const events = [
    ev(1, 'hug', 'bea', { to: 'fig', warmth: 'soup' }, { at: 50 }),
    ev(2, 'hug', 'pip', { to: 'fig', warmth: 'here' }, { at: 150 }),
    ev(3, 'hug', 'pip', { to: 'fig', warmth: 'glow' }, { at: 160 }),
    ev(4, 'hug', 'otis', { to: 'bea' }, { at: 170 }),
    ev(5, 'hug', 'me', { to: 'fig', umbrella: true }, { at: 180 }),
  ];

  it('names who sent warmth since the cloud went up, once each, without you', () => {
    expect(warmthFrom({ events, to: 'fig', since: 100, me: 'me' })).toEqual(['pip']);
  });

  it('knows you already brought an umbrella', () => {
    expect(umbrellaBrought({ events, pending: [], to: 'fig', since: 100, me: 'me' })).toBe(true);
    expect(umbrellaBrought({ events, pending: [], to: 'fig', since: 200, me: 'me' })).toBe(false);
  });
});

describe('slow posts to a friend', () => {
  it('lists yours to that friend with when each arrives, and not once recalled', () => {
    const events = [
      ev(1, 'slow_post', 'me', { to: 'bea', text: 'a', when: 'morning', deliverAt: 500 }),
      ev(2, 'slow_post', 'me', { to: 'bea', text: 'b', when: 'weekend', deliverAt: 900 }),
      ev(3, 'slow_post', 'me', { to: 'pip', text: 'c', when: 'morning', deliverAt: 900 }),
      ev(4, 'unsend', 'me', { target: 2, by: 'author' }),
    ];
    expect(slowPostsTo({ events, me: 'me', to: 'bea' })).toEqual([{ seq: 1, deliverAt: 500 }]);
  });
});

const item = (over: Partial<QuickTendItem>): QuickTendItem => ({
  farm: 'f1',
  farmKind: 'farm',
  name: 'Book Club',
  with: null,
  seq: 1,
  kind: 'message',
  actor: 'bea',
  at: 0,
  preview: null,
  why: 'question',
  ...over,
});

describe('Quick Tend', () => {
  it('draws three cards and folds the rest into the bouquet', () => {
    const items = [1, 2, 3, 4, 5].map((seq) => item({ seq }));
    const { cards, rest } = splitQuickTend(items);
    expect(cards.map((c) => c.seq)).toEqual([1, 2, 3]);
    expect(rest.map((c) => c.seq)).toEqual([4, 5]);
  });

  it('answers a plan with an RSVP only when it is the plan itself', () => {
    expect(repliesFor(item({ why: 'plan', kind: 'seed_planted' }))[0]?.kind).toBe('rsvp');
    expect(repliesFor(item({ why: 'plan', kind: 'message' }))[0]?.kind).toBe('message');
  });

  it('sums the bouquet up by names and kinds, never by how many', () => {
    const names: Record<string, string> = { fig: 'Fig', bea: 'Bea' };
    const rest = [
      item({ kind: 'media', actor: 'fig' }),
      item({ kind: 'media', actor: 'fig', seq: 2 }),
      item({ kind: 'voice', actor: 'bea' }),
      item({ kind: 'message', actor: 'bea' }),
    ];
    expect(bouquetParts(rest, (i) => names[i.actor ?? ''] ?? null)).toEqual([
      { key: 'photos', name: 'Fig' },
      { key: 'voice', name: 'Bea' },
      { key: 'hellos' },
    ]);
  });
});

describe('files', () => {
  it('sizes and sorts files as Files does', () => {
    expect(sizeOf(240_000)).toEqual({ value: '240', unit: 'KB' });
    expect(sizeOf(1_200_000)).toEqual({ value: '1.2', unit: 'MB' });
    expect(sizeOf(512)).toEqual({ value: '512', unit: 'B' });
    expect(sortOf('application/pdf')).toBe('pdf');
    expect(sortOf('application/octet-stream', 'rota.PDF')).toBe('pdf');
    expect(sortOf('image/png')).toBe('image');
  });

  it('keeps uploads within 100 MB, leaving an unknown size to the upload', () => {
    expect(fitsUpload(100 * 1024 * 1024)).toBe(true);
    expect(fitsUpload(100 * 1024 * 1024 + 1)).toBe(false);
    expect(fitsUpload(0)).toBe(true);
  });
});

describe('Quick Tend answers', () => {
  it('reply to the waiting message, say yes to a plan, or water a birthday rose', () => {
    const asked = item({ seq: 9, why: 'question' });
    expect(writeOf(asked, { kind: 'message', words: 'yes' }, 'Yes!')).toEqual({
      kind: 'message',
      payload: { text: 'Yes!', replyTo: 9 },
    });
    const plan = item({ seq: 4, why: 'plan', kind: 'seed_planted' });
    expect(writeOf(plan, { kind: 'rsvp', answer: 'in', words: 'imIn' }, '')).toEqual({
      kind: 'rsvp',
      payload: { seed: 4, answer: 'in' },
    });
    const birthday = item({ why: 'birthday', actor: 'bea' });
    expect(writeOf(birthday, { kind: 'dewdrop', words: 'happyBirthday' }, '')).toEqual({
      kind: 'dewdrop',
      payload: { to: 'bea' },
    });
  });
});
