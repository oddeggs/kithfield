import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /api/health', () => {
  it('answers with the environment and commit', async () => {
    const response = await exports.default.fetch('https://dev.kithfield.com/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', environment: 'dev', commit: 'local' });
  });

  it('answers an unknown path with the not-found error', async () => {
    const response = await exports.default.fetch('https://dev.kithfield.com/api/nowhere');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not_found' } });
  });
});
