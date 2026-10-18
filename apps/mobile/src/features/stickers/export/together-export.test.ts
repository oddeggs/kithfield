import { describe, expect, it } from '@jest/globals';

import { addTogetherExport, approvedExports } from './together-export';

const us = { farm: 'f1', sticker: 'us', with: ['pip', 'bea'] };
const gang = { farm: 'f1', sticker: 'gang', with: ['fig'] };

describe('together stickers leaving Kithfield', () => {
  it('goes only once everyone in it said OK', () => {
    expect(approvedExports([us, gang], [['pip'], ['fig']])).toEqual([gang]);
    expect(approvedExports([us, gang], [['bea', 'pip'], []])).toEqual([us]);
  });

  it('remembers each asked-for sticker once, newest last', () => {
    expect(addTogetherExport([us], { ...us, with: ['bea', 'pip'] })).toEqual([us]);
    expect(addTogetherExport([us], gang)).toEqual([us, gang]);
  });
});
