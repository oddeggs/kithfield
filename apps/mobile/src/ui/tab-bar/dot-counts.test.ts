import { describe, expect, it } from '@jest/globals';

import { countDot, dotsOf, noDotCounts } from './dot-counts';

describe('tab dots', () => {
  it('stays while any caller still asks for it', () => {
    let c = countDot(noDotCounts, 'chat', 1);
    c = countDot(c, 'chat', 1);
    expect(dotsOf(c).chat).toBe(true);
    c = countDot(c, 'chat', -1);
    expect(dotsOf(c).chat).toBe(true);
    c = countDot(c, 'chat', -1);
    expect(dotsOf(c).chat).toBe(false);
  });

  it('keeps tabs apart and never goes below none', () => {
    let c = countDot(noDotCounts, 'farm', -1);
    expect(c).toBe(noDotCounts);
    c = countDot(c, 'seedbed', 1);
    expect(dotsOf(c)).toEqual({ farm: false, chat: false, seedbed: true, you: false });
  });
});
