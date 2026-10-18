import { describe, expect, it } from '@jest/globals';

import { aiDataCount, providerFrom } from './consent';

const allowed = (feature: 'captions' | 'recap') => ({
  feature,
  allowed: true,
  textVersion: '2026-10-18',
  at: 1,
});

describe('the outside AI', () => {
  it('has no provider until the config names one', () => {
    expect(providerFrom(undefined)).toBeNull();
    expect(providerFrom({})).toBeNull();
    expect(providerFrom({ aiProvider: '' })).toBeNull();
    expect(providerFrom({ aiProvider: 42 })).toBeNull();
    expect(providerFrom({ aiProvider: ' Acme AI ' })).toBe('Acme AI');
  });

  it('leaves the outside AI out of the count while there is no provider', () => {
    expect(aiDataCount(null, false, [])).toBeNull();
    expect(aiDataCount(null, true, [allowed('captions')])).toBeNull();
  });

  it('counts what is off across the phone and the provider once there is one', () => {
    expect(aiDataCount('Acme AI', false, [])).toEqual({ off: 3, all: 3 });
    expect(aiDataCount('Acme AI', true, [allowed('captions')])).toEqual({ off: 1, all: 3 });
  });
});
