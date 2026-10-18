import { describe, expect, it } from '@jest/globals';

import { markSeen, seenTo } from './seen';

describe('the seen-to marker on this phone', () => {
  it('only moves forward, per farm', () => {
    let marks = markSeen({}, 'a', 10);
    marks = markSeen(marks, 'a', 7);
    marks = markSeen(marks, 'b', 3);
    expect(seenTo(marks, 'a')).toBe(10);
    expect(seenTo(marks, 'b')).toBe(3);
    expect(seenTo(marks, 'c')).toBe(0);
  });

  it('keeps the same object when nothing moved, so nothing re-renders or rewrites', () => {
    const marks = markSeen({}, 'a', 10);
    expect(markSeen(marks, 'a', 10)).toBe(marks);
  });
});
