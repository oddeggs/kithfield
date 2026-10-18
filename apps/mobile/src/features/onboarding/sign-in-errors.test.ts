import { describe, expect, it } from '@jest/globals';

import { AuthError } from '../../data/session';
import { codeFailure, sendFailure } from './sign-in-errors';

describe('what a failed code says', () => {
  it('shakes for a wrong or expired code', () => {
    expect(codeFailure(new AuthError({ status: 400, code: 'INVALID_OTP' }))).toBe('wrong');
    expect(codeFailure(new AuthError({ status: 400, code: 'OTP_EXPIRED' }))).toBe('wrong');
  });

  it('tells someone locked out to try tomorrow or another way', () => {
    expect(codeFailure(new AuthError({ status: 429 }))).toBe('lockout');
    expect(codeFailure(new AuthError({ status: 403, code: 'TOO_MANY_ATTEMPTS' }))).toBe('lockout');
  });

  it('says the network failed when nothing answered', () => {
    expect(codeFailure(new TypeError('Network request failed'))).toBe('failed');
    expect(codeFailure(new AuthError({ status: 503 }))).toBe('failed');
  });
});

describe('what a failed send says', () => {
  it('is a lockout only when the address was asked for too often', () => {
    expect(sendFailure(new AuthError({ status: 429 }))).toBe('lockout');
    expect(sendFailure(new TypeError('Network request failed'))).toBe('failed');
  });
});
