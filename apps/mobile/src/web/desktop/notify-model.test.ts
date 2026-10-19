import type { ChatListItem } from '@kithfield/contracts';
import { describe, expect, it } from '@jest/globals';

import { softNotes } from './notify-model';

const row = (over: Partial<ChatListItem>): ChatListItem => ({
  farm: 'f1',
  seq: 10,
  kind: 'message',
  actor: 'bea',
  at: 1,
  preview: 'see you sat',
  forYou: false,
  farmKind: 'farm',
  name: 'The Thursday Lot',
  with: null,
  waiting: 0,
  muted: false,
  pinned: false,
  ...over,
});

describe('soft banners on the desktop', () => {
  it('says nothing for what was there when the list was first read', () => {
    const seen = new Map<string, number>();
    expect(softNotes([row({ forYou: true, kind: 'firefly' })], seen, 'me')).toEqual([]);
    expect(seen.get('f1')).toBe(10);
  });

  it('owes a banner for a firefly on your step, with its farm', () => {
    const seen = new Map([['f1', 10]]);
    expect(softNotes([row({ seq: 11, forYou: true, kind: 'firefly' })], seen, 'me')).toEqual([
      {
        farm: 'f1',
        seq: 11,
        actor: 'bea',
        farmName: 'The Thursday Lot',
        knownName: null,
        body: 'push.doorstep.firefly',
        preview: null,
      },
    ]);
  });

  it('carries a mention’s own line', () => {
    const seen = new Map([['f1', 10]]);
    const [note] = softNotes([row({ seq: 12, forYou: true })], seen, 'me');
    expect(note?.body).toBe('push.mention');
    expect(note?.preview).toBe('see you sat');
  });

  it('stays quiet for chat not meant for you, a muted farm and your own doing', () => {
    const seen = new Map([['f1', 10]]);
    expect(softNotes([row({ seq: 11 })], seen, 'me')).toEqual([]);
    expect(softNotes([row({ seq: 12, forYou: true, muted: true })], seen, 'me')).toEqual([]);
    expect(softNotes([row({ seq: 13, forYou: true, actor: 'me' })], seen, 'me')).toEqual([]);
  });

  it('never banners the same thing twice, nor kinds without a banner', () => {
    const seen = new Map([['f1', 10]]);
    const firefly = row({ seq: 11, forYou: true, kind: 'firefly' });
    expect(softNotes([firefly], seen, 'me')).toHaveLength(1);
    expect(softNotes([firefly], seen, 'me')).toEqual([]);
    expect(softNotes([row({ seq: 12, forYou: true, kind: 'dewdrop' })], seen, 'me')).toEqual([]);
  });

  it('knows a visit’s friend by name and gives it no farm', () => {
    const seen = new Map([['v1', 1]]);
    const critter = { species: 'owl' } as NonNullable<ChatListItem['with']>['critter'];
    const [note] = softNotes(
      [
        row({
          farm: 'v1',
          seq: 2,
          forYou: true,
          kind: 'knock',
          farmKind: 'visit',
          name: null,
          with: { person: 'bea', name: 'Bea', critter },
        }),
      ],
      seen,
      'me',
    );
    expect(note?.farmName).toBeNull();
    expect(note?.knownName).toBe('Bea');
    expect(note?.body).toBe('push.knock');
  });
});
