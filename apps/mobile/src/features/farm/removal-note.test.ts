import { describe, expect, it } from '@jest/globals';

import { removalNote } from './removal-note';

const former = (how: 'left' | 'removed' | 'account_deleted') => ({ how });

describe('the note about a farm you are no longer on', () => {
  it('says a keeper made the change when a keeper removed you', () => {
    expect(removalNote({ former: former('removed'), by: 'keeper', stillHeld: false })).toBe(
      'keeper',
    );
  });

  it('names no one when the safety team removed you, or nobody knows who', () => {
    expect(removalNote({ former: former('removed'), by: 'safety', stillHeld: false })).toBe(
      'neutral',
    );
    expect(removalNote({ former: former('removed'), by: null, stillHeld: false })).toBe('neutral');
  });

  it('still says something when the farm turned you away before the removal reached the phone', () => {
    expect(removalNote({ former: null, by: null, stillHeld: true })).toBe('neutral');
  });

  it('says nothing when you left by choice', () => {
    expect(removalNote({ former: former('left'), by: null, stillHeld: false })).toBeNull();
    expect(removalNote({ former: null, by: null, stillHeld: false })).toBeNull();
  });
});
