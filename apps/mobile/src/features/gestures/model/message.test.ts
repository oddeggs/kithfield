import { describe, expect, it } from '@jest/globals';

import { forwardWrite, togglePick, unforwardable } from './forward';
import {
  dewdropped,
  menuActions,
  menuDeadlines,
  myReaction,
  shownText,
  type LogEvent,
} from './message';
import { DEWDROP, QUICK_COUNT, quickReactions, reactionRow } from './reactions';

const MIN = 60_000;
const ev = (
  seq: number,
  kind: string,
  actor: string | null,
  payload: unknown,
  at = 0,
): LogEvent => ({
  seq,
  at,
  actor,
  kind,
  payload,
});

describe('the long-press menu', () => {
  const now = 100 * MIN;
  const mine = ev(5, 'message', 'me', { text: 'picnic?' }, now - 5 * MIN);
  const theirs = ev(6, 'message', 'bea', { text: 'yes' }, now - 5 * MIN);
  const anything = () => true;

  it('offers your own message edit and unsend, never report', () => {
    expect(
      menuActions({ event: mine, me: 'me', text: 'picnic?', pinned: false, can: anything }),
    ).toEqual(['reply', 'edit', 'pin', 'plant', 'copy', 'forward', 'unsend']);
  });

  it('offers only what the farm would take, as the shared rules say', () => {
    const asked: string[] = [];
    const rules = (w: { kind: string }) => {
      asked.push(w.kind);
      return w.kind !== 'edit' && w.kind !== 'unsend';
    };
    const later = menuActions({
      event: mine,
      me: 'me',
      text: 'picnic?',
      pinned: false,
      can: rules,
    });
    expect(later).not.toContain('edit');
    expect(later).not.toContain('unsend');
    expect(asked).toEqual(expect.arrayContaining(['edit', 'unsend', 'pin']));
  });

  it("offers a friend's message report instead of edit and unsend", () => {
    expect(
      menuActions({ event: theirs, me: 'me', text: 'yes', pinned: true, can: anything }),
    ).toEqual(['reply', 'unpin', 'plant', 'copy', 'forward', 'report']);
  });

  it('has nothing for an unsent message or a farm record', () => {
    const gone = ev(7, 'message', 'bea', { tombstone: 'unsent' });
    expect(
      menuActions({ event: gone, me: 'me', text: null, pinned: false, can: anything }),
    ).toEqual([]);
    const joined = ev(8, 'joined', 'bea', {});
    expect(
      menuActions({ event: joined, me: 'me', text: null, pinned: false, can: anything }),
    ).toEqual([]);
  });

  it('looks again when the edit window closes and when a slow post arrives', () => {
    const post = ev(
      9,
      'slow_post',
      'me',
      { to: 'bea', text: 'hi', when: 'morning', deliverAt: now + 60 * MIN },
      now,
    );
    expect(menuDeadlines(post)).toEqual([now + 15 * MIN, now + 60 * MIN]);
    expect(menuDeadlines(mine)).toEqual([now + 10 * MIN]);
  });
});

describe('what a message shows', () => {
  it('takes the latest edit by its author', () => {
    const msg = ev(1, 'message', 'bea', { text: 'one' });
    const events = [
      msg,
      ev(2, 'edit', 'bea', { target: 1, text: 'two' }),
      ev(3, 'edit', 'pip', { target: 1, text: 'not hers' }),
      ev(4, 'edit', 'bea', { target: 1, text: 'three' }),
    ];
    expect(shownText(msg, events)).toBe('three');
  });

  it('reads a link by its words, then its address', () => {
    expect(shownText(ev(1, 'link', 'bea', { url: 'https://a.b' }), [])).toBe('https://a.b');
  });

  it('knows your one reaction, and that a null took it back', () => {
    const events = [
      ev(2, 'reaction', 'me', { target: 1, reaction: 'sun' }),
      ev(3, 'reaction', 'bea', { target: 1, reaction: 'moon' }),
      ev(4, 'reaction', 'me', { target: 1, reaction: null }),
    ];
    expect(myReaction(events, [], 1, 'me')).toBeNull();
    expect(myReaction(events.slice(0, 2), [], 1, 'me')).toBe('sun');
    expect(
      myReaction(
        events.slice(0, 2),
        [{ kind: 'reaction', payload: { target: 1, reaction: 'moon' } }],
        1,
        'me',
      ),
    ).toBe('moon');
    expect(dewdropped([ev(5, 'dewdrop', 'me', { target: 1 })], [], 1, 'me')).toBe(true);
    expect(dewdropped([], [{ kind: 'dewdrop', payload: { target: 1 } }], 1, 'me')).toBe(true);
  });
});

describe('the reaction tray', () => {
  it('keeps the dewdrop first and fills from the favourites, then the defaults', () => {
    const quick = quickReactions(['moon', 'moon', 'leaf', 'unknown_one']).map((r) => r.id);
    expect(quick[0]).toBe(DEWDROP);
    expect(quick.slice(1, 3)).toEqual(['moon', 'leaf']);
    expect(quick).toHaveLength(QUICK_COUNT);
    expect(quick).not.toContain('unknown_one');
  });
});

describe('forwarding', () => {
  it('carries where it came from and leaves replies, mentions and together friends behind', () => {
    const msg = ev(4, 'message', 'bea', { text: 'old', replyTo: 2, mentions: ['me'] });
    expect(forwardWrite(msg, { farm: 'f1', text: 'edited' })).toEqual({
      kind: 'message',
      payload: { text: 'edited', forwardedFrom: { farm: 'f1', seq: 4 } },
    });
    const together = ev(6, 'sticker', 'bea', {
      pack: 'cosy',
      sticker: 'hug',
      with: ['pip'],
      forwardedFrom: { farm: 'f0', seq: 1 },
    });
    expect(forwardWrite(together, { farm: 'f1', text: null })).toEqual({
      kind: 'sticker',
      payload: { pack: 'cosy', sticker: 'hug', forwardedFrom: { farm: 'f1', seq: 6 } },
    });
    expect(
      forwardWrite(ev(5, 'quiet_note', 'bea', { text: 'x' }), { farm: 'f1', text: null }),
    ).toBeNull();
  });

  it('keeps photos, voice notes and link previews on their farm for now', () => {
    const ref = { key: 'farm/f1/0', mime: 'image/png', bytes: 1 };
    const photo = ev(7, 'media', 'bea', { items: [ref] });
    const voice = ev(8, 'voice', 'bea', { audio: ref, durationMs: 1000, waveform: [] });
    const pictured = ev(9, 'link', 'bea', { url: 'https://a.b', preview: { image: ref } });
    const plain = ev(10, 'link', 'bea', { url: 'https://a.b', preview: { title: 'A' } });
    for (const e of [photo, voice, pictured]) {
      expect(unforwardable(e)).toBe('media');
      expect(forwardWrite(e, { farm: 'f1', text: null })).toBeNull();
    }
    expect(unforwardable(plain)).toBeNull();
  });

  it('picks up to five places', () => {
    let picked: string[] = [];
    for (const f of ['a', 'b', 'c', 'd', 'e', 'f']) picked = togglePick(picked, f);
    expect(picked).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(togglePick(picked, 'c')).toEqual(['a', 'b', 'd', 'e']);
  });
});

describe('the reaction row', () => {
  it('draws the dewdrop first, then each reaction once, never how many', () => {
    const events = [
      ev(2, 'reaction', 'bea', { target: 1, reaction: 'sun' }),
      ev(3, 'reaction', 'pip', { target: 1, reaction: 'sun' }),
      ev(4, 'dewdrop', 'pip', { target: 1 }),
      ev(5, 'reaction', 'me', { target: 1, reaction: 'kite_new' }),
      ev(6, 'reaction', 'fig', { target: 1, reaction: 'moon' }),
      ev(7, 'reaction', 'fig', { target: 1, reaction: null }),
      ev(8, 'reaction', 'otis', { target: 9, reaction: 'leaf' }),
    ];
    expect(reactionRow(events, 1, 'me')).toEqual([
      { id: 'dewdrop', icon: 'dewdrop', mine: false },
      { id: 'sun', icon: 'sun', mine: false },
      { id: 'kite_new', icon: 'sparkle', mine: true },
    ]);
  });
});
