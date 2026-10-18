import { describe, expect, it } from '@jest/globals';

import { filterHits, goneIn, highlight, localHits, mergeHits, type Hit } from './search';
import type { LogEvent } from './timeline';

const ev = (seq: number, actor: string, kind: string, payload: unknown): LogEvent => ({
  seq,
  opId: `op-${seq}`,
  at: 1000 * seq,
  actor,
  kind,
  payload,
  known: true,
});

describe('search', () => {
  const events = [
    ev(2, 'pip', 'message', { text: "ok who's up for a picnic before it gets cold" }),
    ev(3, 'fig', 'message', { text: 'picnics are the best' }),
    ev(4, 'fig', 'edit', { target: 3, text: 'cakes for the picnic' }),
    ev(5, 'bea', 'message', { tombstone: 'unsent' }),
    ev(6, 'bea', 'unsend', { target: 5, by: 'author' }),
    ev(7, 'bea', 'link', {
      url: 'https://hollowcreekparks.org/w',
      preview: { title: 'Willow Bend picnic meadow' },
    }),
    ev(8, 'mo', 'media', { items: [], caption: 'Picnic spot' }),
    ev(9, 'mo', 'message', { text: 'unrelated' }),
  ];

  it('finds words on this phone, with edits applied and unsent messages left out', () => {
    const hits = localHits('f', events, 'pic');
    expect(hits.map((h) => [h.seq, h.text])).toEqual([
      [2, "ok who's up for a picnic before it gets cold"],
      [3, 'cakes for the picnic'],
      [7, 'Willow Bend picnic meadow https://hollowcreekparks.org/w'],
      [8, 'Picnic spot'],
    ]);
  });

  it('merges the farm’s hits with the phone’s, newest first, once each', () => {
    const server: Hit[] = [
      { farm: 'f', seq: 3, at: 3000, actor: 'fig', kind: 'message', text: 'picnics are the best' },
      { farm: 'f', seq: 1, at: 1000, actor: 'mo', kind: 'message', text: 'an old picnic' },
    ];
    const merged = mergeHits(server, localHits('f', events, 'picnic'));
    expect(merged.map((h) => h.seq)).toEqual([8, 7, 3, 2, 1]);
    expect(merged.find((h) => h.seq === 3)?.text).toBe('cakes for the picnic');
  });

  it('filters by tab and by person', () => {
    const hits = localHits('f', events, 'picnic');
    expect(filterHits(hits, 'messages', { person: null }).map((h) => h.seq)).toEqual([2, 3]);
    expect(filterHits(hits, 'messages', { person: 'pip' }).map((h) => h.seq)).toEqual([2]);
    expect(filterHits(hits, 'links', { person: null }).map((h) => h.seq)).toEqual([7]);
    expect(filterHits(hits, 'photos', { person: null }).map((h) => h.seq)).toEqual([8]);
  });

  it('marks the words the query starts, ignoring case and marks', () => {
    expect(highlight('that Picnic by the lake', 'pic')).toEqual([
      { text: 'that ', hit: false },
      { text: 'Picnic', hit: true },
      { text: ' by the lake', hit: false },
    ]);
    expect(highlight('Đi dã ngoại nhé', 'ngoai')).toEqual([
      { text: 'Đi dã ', hit: false },
      { text: 'ngoại', hit: true },
      { text: ' nhé', hit: false },
    ]);
  });

  it('drops the farm’s hits for messages this phone knows were unsent', () => {
    const server: Hit[] = [
      { farm: 'f', seq: 5, at: 5000, actor: 'bea', kind: 'message', text: 'picnic gone' },
      { farm: 'f', seq: 1, at: 1000, actor: 'mo', kind: 'message', text: 'an old picnic' },
    ];
    const merged = mergeHits(server, localHits('f', events, 'picnic'), goneIn('f', events));
    expect(merged.map((h) => h.seq)).not.toContain(5);
    expect(merged.map((h) => h.seq)).toContain(1);
  });

  it('finds nothing said by someone you blocked', () => {
    const server: Hit[] = [
      { farm: 'f', seq: 7, at: 7000, actor: 'bram', kind: 'message', text: 'picnic is dumb' },
      { farm: 'f', seq: 1, at: 1000, actor: 'mo', kind: 'message', text: 'an old picnic' },
    ];
    const local: Hit[] = [
      { farm: 'f', seq: 8, at: 8000, actor: 'bram', kind: 'message', text: 'picnic again' },
    ];
    const merged = mergeHits(server, local, new Set(), new Set(['bram']));
    expect(merged.map((h) => h.seq)).toEqual([1]);
  });
});
