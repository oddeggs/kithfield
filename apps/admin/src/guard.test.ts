import { beforeEach, describe, expect, it } from 'vitest';

import app from './index';

/** The API Worker behind the service binding, recording what reaches it. */
const reached: Request[] = [];
const env = {
  ENVIRONMENT: 'dev',
  API: {
    fetch: (request: Request) => {
      reached.push(request);
      return Promise.resolve(Response.json({ action: 'A-1', status: 'applied' }));
    },
  },
};

const HOST = 'https://admin-dev.kithfield.com';
const post = (path: string, headers: Record<string, string>) =>
  app.request(
    `${HOST}${path}`,
    { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', ...headers } },
    env,
  );

beforeEach(() => {
  reached.length = 0;
});

describe('requests that change something come only from the desk itself', () => {
  it('refuses a passthrough write with no Origin, or from another site', async () => {
    expect((await post('/admin/v1/reports/R-1/actions', {})).status).toBe(403);
    expect(
      (await post('/admin/v1/reports/R-1/actions', { origin: 'https://evil.example' })).status,
    ).toBe(403);
    expect(
      (await post('/admin/v1/actions/A-1/approve', { 'sec-fetch-site': 'cross-site' })).status,
    ).toBe(403);
    expect(reached).toHaveLength(0);
  });

  it('refuses a form with no Origin', async () => {
    const res = await app.request(
      `${HOST}/actions/A-1/approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: '',
      },
      env,
    );
    expect(res.status).toBe(403);
    expect(reached).toHaveLength(0);
  });

  it('passes writes from the desk’s own pages, by Origin or Sec-Fetch-Site', async () => {
    expect((await post('/admin/v1/actions/A-1/approve', { origin: HOST })).status).toBe(200);
    expect(
      (await post('/admin/v1/actions/A-1/approve', { 'sec-fetch-site': 'same-origin' })).status,
    ).toBe(200);
    expect(reached.map((r) => new URL(r.url).pathname)).toEqual([
      '/api/admin/v1/actions/A-1/approve',
      '/api/admin/v1/actions/A-1/approve',
    ]);
  });

  it('lets reads through without either', async () => {
    const res = await app.request(`${HOST}/admin/v1/queue`, {}, env);
    expect(res.status).toBe(200);
    expect(reached).toHaveLength(1);
  });
});
