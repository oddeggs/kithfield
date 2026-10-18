import type { ChatListItem } from '@kithfield/contracts';
import { describe, expect, it } from '@jest/globals';

import { hasNews, sectionsOf, whatOf } from './chat-list';

const row = (
  farm: string,
  kind: 'farm' | 'visit',
  at: number,
  extra: Partial<ChatListItem> = {},
): ChatListItem => ({
  farm,
  seq: 10,
  kind: 'message',
  actor: 'bea',
  at,
  preview: 'hi',
  forYou: false,
  farmKind: kind,
  name: kind === 'farm' ? farm : null,
  with: null,
  waiting: 0,
  muted: false,
  pinned: false,
  ...extra,
});

describe('the chat list', () => {
  it('splits farms from visits, pinned first, then newest first', () => {
    const s = sectionsOf([
      row('a', 'farm', 1),
      row('b', 'farm', 3),
      row('c', 'farm', 2, { pinned: true }),
      row('v', 'visit', 5),
    ]);
    expect(s.farms.map((r) => r.farm)).toEqual(['c', 'b', 'a']);
    expect(s.visits.map((r) => r.farm)).toEqual(['v']);
  });

  it('leaves out a visit with someone you blocked', () => {
    const peer = (person: string) => ({
      person,
      name: person,
      critter: {
        species: 'badger',
        coat: 'cocoa',
        mark: null,
        accessory: null,
        outfit: null,
        outfitColor: null,
        companion: null,
        cottage: null,
      },
    });
    const s = sectionsOf(
      [
        row('v1', 'visit', 2, { with: peer('bram') } as Partial<ChatListItem>),
        row('v2', 'visit', 1, { with: peer('pip') } as Partial<ChatListItem>),
        row('f1', 'farm', 3),
      ],
      new Set(['bram']),
    );
    expect(s.visits.map((r) => r.farm)).toEqual(['v2']);
    expect(s.farms.map((r) => r.farm)).toEqual(['f1']);
  });

  it('says what a wordless event was', () => {
    expect(whatOf('voice', { kind: 'voice', payload: { durationMs: 168_000 } })).toEqual({
      key: 'voice',
      duration: '2:48',
    });
    expect(whatOf('voice', null)).toEqual({ key: 'voiceShort' });
    expect(whatOf('media', { kind: 'media', payload: { items: [{ mime: 'video/mp4' }] } })).toEqual(
      { key: 'video' },
    );
    expect(whatOf('message', { kind: 'message', payload: { tombstone: 'unsent' } })).toEqual({
      key: 'unsent',
    });
  });

  it('shows a dot only for someone else’s news this phone hasn’t read in', () => {
    expect(hasNews(row('a', 'farm', 1), 'me', 9)).toBe(true);
    expect(hasNews(row('a', 'farm', 1), 'me', 10)).toBe(false);
    expect(hasNews(row('a', 'farm', 1, { actor: 'me' }), 'me', 0)).toBe(false);
    expect(hasNews(row('a', 'farm', 1, { kind: 'farm_opened' }), 'me', 0)).toBe(false);
  });
});
