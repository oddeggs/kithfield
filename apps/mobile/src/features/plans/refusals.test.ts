import { describe, expect, it } from '@jest/globals';

import { refusalKey } from './refusals';

describe('a plan write the farm turns down', () => {
  it('says so plainly when it isn’t this person’s to make', () => {
    expect(refusalKey('not_allowed')).toBe('plans.refusedNotAllowed');
  });

  it('asks to try again for anything else', () => {
    expect(refusalKey('invalid')).toBe('plans.refused');
    expect(refusalKey('limit_reached')).toBe('plans.refused');
  });
});
