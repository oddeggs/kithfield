import { describe, expect, it } from '@jest/globals';

import { refusalOf } from './refusals';

describe('why a write did not send', () => {
  it('offers no retry for reasons that will not change', () => {
    for (const reason of [
      'edit_window_closed',
      'gone',
      'not_allowed',
      'account_paused',
      'farm_frozen',
    ]) {
      expect(refusalOf(reason).retry).toBe(false);
    }
  });

  it('lets other refusals be tried again', () => {
    expect(refusalOf('invalid')).toEqual({ copy: 'chat.refused.other', retry: true });
    expect(refusalOf('limit_reached').retry).toBe(true);
  });

  it('names each permanent reason', () => {
    expect(refusalOf('farm_frozen').copy).toBe('chat.refused.frozen');
    expect(refusalOf('something_new').copy).toBe('chat.refused.other');
  });
});
