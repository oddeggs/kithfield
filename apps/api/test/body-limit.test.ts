import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { BODY_LIMIT_BYTES } from '../src/app';

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  exports.default.fetch(`https://dev.kithfield.com/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.66.0.1', ...headers },
    body,
  });

describe('request bodies', () => {
  it('are refused over the limit before any route reads them', async () => {
    const big = JSON.stringify({ email: 'a@example.com', padding: 'x'.repeat(BODY_LIMIT_BYTES) });
    for (const path of [
      '/v1/waitlist',
      '/v1/desktop-link',
      '/v1/webhooks/stripe',
      '/auth/sign-in/anonymous',
    ]) {
      const response = await post(path, big);
      expect(response.status, path).toBe(413);
      expect(await response.json()).toEqual({ error: { code: 'too_large' } });
    }
  });

  it('pass under the limit', async () => {
    const response = await post('/auth/sign-in/anonymous', '{}');
    expect(response.status).toBe(200);
  });
});
