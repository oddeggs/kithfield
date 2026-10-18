import { describe, expect, it } from '@jest/globals';

import {
  draftSegments,
  insertMention,
  mentionQuery,
  mentionsIn,
  rankMentions,
  segmentsOf,
} from './mentions';

const members = [
  { person: 'huck', name: 'Huck', dozing: true },
  { person: 'bram', name: 'Bram', dozing: false },
  { person: 'bea', name: 'Bea', dozing: false },
  { person: 'me', name: 'June', dozing: false },
  { person: 'beo', name: 'Bé Ơi', dozing: false },
];

describe('mentions', () => {
  it('finds the @word at the caret, only at the start of a word', () => {
    expect(mentionQuery('bringing a blanket. @Be', 23)).toEqual({ start: 20, query: 'Be' });
    expect(mentionQuery('mail@home', 9)).toBeNull();
    expect(mentionQuery('@Bea is here', 12)).toBeNull();
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('filters as you type, leaves you out and lists dozing friends last', () => {
    expect(rankMentions(members, '', 'me').map((m) => m.person)).toEqual([
      'bram',
      'bea',
      'beo',
      'huck',
    ]);
    expect(rankMentions(members, 'be', 'me').map((m) => m.person)).toEqual(['bea', 'beo']);
    expect(rankMentions(members, 'u', 'me').map((m) => m.person)).toEqual(['huck']);
  });

  it('puts the name in place of what was typed', () => {
    expect(insertMention('hi @Be there', 3, 6, 'Bea')).toEqual({ text: 'hi @Bea there', caret: 8 });
    expect(insertMention('hi @Be', 3, 6, 'Bea')).toEqual({ text: 'hi @Bea ', caret: 8 });
  });

  it('names whom a message mentions, once each, longest names first', () => {
    const named = [...members, { person: 'bear', name: 'Bea Rose', dozing: false }];
    expect(mentionsIn('@Bea Rose and @Bea, @Bea!', named).sort()).toEqual(['bea', 'bear']);
    expect(mentionsIn('email bea@x.com', named)).toEqual([]);
  });

  it('splits text into plain runs and mentions', () => {
    expect(segmentsOf('ooh @Bea @Nell we should go', ['Bea', 'Nell'])).toEqual([
      { text: 'ooh ', mention: false },
      { text: '@Bea', mention: true },
      { text: ' ', mention: false },
      { text: '@Nell', mention: true },
      { text: ' we should go', mention: false },
    ]);
    expect(draftSegments('bringing a blanket. @Be', [], 23)).toEqual([
      { text: 'bringing a blanket. ', mention: false },
      { text: '@Be', mention: true },
    ]);
  });
});
