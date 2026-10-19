import { describe, expect, it, jest } from '@jest/globals';

import { handOverAppleCode } from './social';

describe("handing over an Apple sign-in's code", () => {
  it('posts it to the server, which keeps a token to revoke when the account is deleted', async () => {
    const request = jest.fn(() => Promise.resolve(null));
    await handOverAppleCode({ request } as never, 'code-1');
    expect(request).toHaveBeenCalledWith(expect.anything(), 'POST', '/v1/me/apple-authorization', {
      code: 'code-1',
    });
  });

  it('never fails the sign-in when the server is unreachable', async () => {
    const request = jest.fn(() => Promise.reject(new Error('offline')));
    await expect(handOverAppleCode({ request } as never, 'code-2')).resolves.toBeUndefined();
  });
});
