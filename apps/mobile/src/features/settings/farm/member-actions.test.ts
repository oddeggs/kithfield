import { describe, expect, it } from '@jest/globals';

import { memberActions } from './member-actions';

describe('what you can do for a member', () => {
  it('lets you only leave, on your own row', () => {
    expect(memberActions('june', { person: 'june', role: 'keeper' }, 'keeper')).toEqual(['leave']);
  });

  it('lets a keeper change roles, report and remove a critter or helper', () => {
    expect(memberActions('june', { person: 'bram', role: 'critter' }, 'keeper')).toEqual([
      'makeHelper',
      'makeKeeper',
      'report',
      'remove',
    ]);
    expect(memberActions('june', { person: 'bea', role: 'helper' }, 'keeper')).toEqual([
      'makeKeeper',
      'makeCritter',
      'report',
      'remove',
    ]);
  });

  it('never offers to remove another keeper', () => {
    expect(memberActions('june', { person: 'pip', role: 'keeper' }, 'keeper')).toEqual([
      'makeHelper',
      'makeCritter',
      'report',
      'block',
    ]);
  });

  it('lets everyone else report and block', () => {
    expect(memberActions('bea', { person: 'pip', role: 'keeper' }, 'helper')).toEqual([
      'report',
      'block',
    ]);
  });
});
