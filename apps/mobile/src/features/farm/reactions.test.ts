import { describe, expect, it } from '@jest/globals';

import { lampsLit, REACT_EVERY_MS, reactionTo, type ReactionEvent } from './reactions';

const said = (seq: number, actor: string, text: string, kind = 'message'): ReactionEvent => ({
  seq,
  actor,
  kind,
  payload: { text },
});

describe('the farm reacting to a message', () => {
  const opened = { afterSeq: 4, lastAt: null };

  it('pops what a friend just said over their cottage', () => {
    const events = [said(3, 'bea', 'old news'), said(5, 'bea', 'anyone up?')];
    expect(reactionTo(events, 'me', opened, 10_000)).toEqual({
      reaction: { key: '5', person: 'bea', text: 'anyone up?' },
      afterSeq: 5,
    });
  });

  it('never reacts to your own words, to what was there as the farm opened, or to other kinds', () => {
    const events = [said(4, 'bea', 'before'), said(5, 'me', 'mine'), said(6, 'bea', '', 'dewdrop')];
    expect(reactionTo(events, 'me', opened, 10_000)).toEqual({ reaction: null, afterSeq: 6 });
  });

  it('makes one reaction of a burst, every four seconds at most', () => {
    const first = reactionTo([said(5, 'bea', 'hi')], 'me', opened, 10_000);
    const burst = [said(5, 'bea', 'hi'), said(6, 'fig', 'hey'), said(7, 'bea', 'soup?')];
    const soon = reactionTo(burst, 'me', { afterSeq: 5, lastAt: 10_000 }, 12_000);
    expect(first.reaction?.text).toBe('hi');
    expect(soon).toEqual({ reaction: null, afterSeq: 7 });
    const later = reactionTo(
      [...burst, said(8, 'fig', 'yes')],
      'me',
      { afterSeq: 7, lastAt: 10_000 },
      10_000 + REACT_EVERY_MS,
    );
    expect(later.reaction).toEqual({ key: '8', person: 'fig', text: 'yes' });
  });
});

describe('a lamp lighting', () => {
  const key = (lit: string, season = 'autumn') =>
    `farm-backdrop:${JSON.stringify({ scene: 'farm', attrs: { season, night: true, lit } })}`;

  it('is a new lamp on and nothing else changed', () => {
    expect(lampsLit(key('rabbit'), key('rabbit,sheep'))).toBe(true);
    expect(lampsLit(key('none'), key('sheep'))).toBe(true);
  });

  it('is not a lamp going out, the same lamps, or a new season', () => {
    expect(lampsLit(key('rabbit,sheep'), key('rabbit'))).toBe(false);
    expect(lampsLit(key('rabbit'), key('rabbit'))).toBe(false);
    expect(lampsLit(key('rabbit'), key('rabbit,sheep', 'winter'))).toBe(false);
  });
});
