import { describe, expect, it } from '@jest/globals';

import { colonQuery, matchStickers, MAX_SUGGESTIONS, withoutQuery } from './sticker-match';

const option = (sticker: string, words: string) => ({ pack: 'mine', sticker, words });

describe('stickers by typing a colon', () => {
  it('finds the word being typed after a colon at the caret', () => {
    expect(colonQuery('miss you all :hu', 16)).toEqual({ start: 13, query: 'hu' });
    expect(colonQuery(':hug', 4)).toEqual({ start: 0, query: 'hug' });
    expect(colonQuery('chào :chà', 9)).toEqual({ start: 5, query: 'chà' });
  });

  it('ignores a colon inside a word, a lone colon and a caret elsewhere', () => {
    expect(colonQuery('time 10:30', 10)).toBeNull();
    expect(colonQuery('hello :', 7)).toBeNull();
    expect(colonQuery('hi :hug there', 13)).toBeNull();
  });

  it('puts words that start with the query before words that only contain it', () => {
    const found = matchStickers(
      [option('a', 'thank you'), option('b', 'hug!'), option('c', 'a big hug')],
      'hu',
    );
    expect(found.map((o) => o.sticker)).toEqual(['b', 'c']);
    // Neither starts with it: both contain it, in the order given.
    expect(
      matchStickers([option('a', 'yay'), option('b', 'payday')], 'ay').map((o) => o.sticker),
    ).toEqual(['a', 'b']);
  });

  it('matches without accents and never offers one sticker twice', () => {
    const found = matchStickers([option('a', 'chào!'), option('a', 'chào!')], 'chao');
    expect(found).toHaveLength(1);
  });

  it('offers at most a row of them', () => {
    const many = Array.from({ length: 20 }, (_, i) => option(`s${i}`, 'hug'));
    expect(matchStickers(many, 'hug')).toHaveLength(MAX_SUGGESTIONS);
  });

  it('takes the colon word out once a sticker is sent', () => {
    expect(withoutQuery('miss you all :hu', 13, 16)).toBe('miss you all ');
    expect(withoutQuery('a :hu b', 2, 5)).toBe('a b');
  });
});
