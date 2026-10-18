import { describe, expect, it } from '@jest/globals';

import { refusalOf, retryRefused } from './refusals';

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

  it('offers no retry for a file that can never go', () => {
    expect(refusalOf('too_large')).toEqual({ copy: 'chat.refused.tooBig', retry: false });
    expect(refusalOf('unreadable')).toEqual({ copy: 'chat.refused.unreadable', retry: false });
    expect(refusalOf('not_member')).toEqual({ copy: 'chat.refused.notAllowed', retry: false });
  });

  it('names each permanent reason', () => {
    expect(refusalOf('farm_frozen').copy).toBe('chat.refused.frozen');
    expect(refusalOf('something_new').copy).toBe('chat.refused.other');
  });
});

describe('trying a refused write again', () => {
  const refused = { opId: 'o', kind: 'message', payload: { text: 'hi' }, reason: 'invalid' };

  it('writes first and lets the refusal go only once the write is queued', async () => {
    const calls: string[] = [];
    await retryRefused(refused, {
      write: () => {
        calls.push('write');
        return Promise.resolve(true);
      },
      dismiss: () => {
        calls.push('dismiss');
        return Promise.resolve();
      },
    });
    expect(calls).toEqual(['write', 'dismiss']);
  });

  it('keeps the refusal when the write could not be queued', async () => {
    const calls: string[] = [];
    await retryRefused(refused, {
      write: () => Promise.resolve(false),
      dismiss: () => {
        calls.push('dismiss');
        return Promise.resolve();
      },
    });
    expect(calls).toEqual([]);
  });

  it('never retries a refusal that will not change', async () => {
    const calls: string[] = [];
    await retryRefused(
      { ...refused, reason: 'gone' },
      {
        write: () => {
          calls.push('write');
          return Promise.resolve(true);
        },
        dismiss: () => Promise.resolve(),
      },
    );
    expect(calls).toEqual([]);
  });
});
