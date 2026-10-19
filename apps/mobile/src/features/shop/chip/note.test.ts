import { describe, expect, it } from '@jest/globals';

import { chipNoteKey } from './note';

describe('the line under a birthday chip-in', () => {
  it('promises nobody pays until it fills', () => {
    expect(chipNoteKey('open', null)).toBe('shop.chip.privatePromise');
    expect(chipNoteKey('open', 'promised')).toBe('shop.chip.privatePromise');
  });

  it('tells someone who paid that a share is a credit, never a refund', () => {
    expect(chipNoteKey('covered', 'paid')).toBe('shop.chip.privatePaid');
    expect(chipNoteKey('closed', 'paid')).toBe('shop.chip.closedPaid');
  });

  it('says nobody was charged only when that is true', () => {
    expect(chipNoteKey('closed', 'promised')).toBe('shop.chip.closed');
    expect(chipNoteKey('closed', null)).toBe('shop.chip.closed');
  });
});
