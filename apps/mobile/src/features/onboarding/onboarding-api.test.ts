import { describe, expect, it } from '@jest/globals';

import { createOnboardingApi, OnboardingApiError } from './onboarding-api';

type Call = { url: string; init: RequestInit };

function api(status: number, body: unknown) {
  const calls: Call[] = [];
  const client = createOnboardingApi({
    baseUrl: 'https://api.test/api',
    authHeaders: () => Promise.resolve({ authorization: 'Bearer t' }),
    fetch: (url, init) => {
      calls.push({ url: url as string, init: init ?? {} });
      return Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status }));
    },
  });
  return { client, calls };
}

const preview = {
  name: 'The Thursday Lot',
  from: null,
  land: 'meadow',
  critters: [],
  full: false,
  approval: false,
};

describe('the way in on the API', () => {
  it('sends only the birth year and country for the age check', async () => {
    const { client, calls } = api(204, null);
    await expect(client.age({ birthYear: 1998, country: 'GB' })).resolves.toBe('ok');
    expect(calls[0]?.url).toBe('https://api.test/api/v1/me/age');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ birthYear: 1998, country: 'GB' });
    expect((calls[0]?.init.headers as Record<string, string>)['authorization']).toBe('Bearer t');
  });

  it('hears under age as an answer, not a failure', async () => {
    const { client } = api(403, { error: { code: 'under_age' } });
    await expect(client.age({ birthYear: 2020, country: 'GB' })).resolves.toBe('under_age');
  });

  it('accepts the Terms version in force', async () => {
    const { client, calls } = api(204, null);
    await client.acceptTerms({ version: '2026-10-18' });
    expect(calls[0]?.url).toBe('https://api.test/api/v1/me/terms');
  });

  it('reads an invite without a session, and a gone one as null', async () => {
    const found = api(200, preview);
    await expect(found.client.invite('abcd')).resolves.toEqual(preview);
    expect(
      (found.calls[0]?.init.headers as Record<string, string>)['authorization'],
    ).toBeUndefined();
    const gone = api(404, { error: { code: 'invite_invalid' } });
    await expect(gone.client.invite('abcd')).resolves.toBeNull();
  });

  it('fails on an answer the contract does not allow', async () => {
    const { client } = api(200, { name: 'x' });
    await expect(client.invite('abcd')).rejects.toBeInstanceOf(OnboardingApiError);
    const broken = api(500, null);
    await expect(broken.client.acceptTerms({ version: '2026-10-18' })).rejects.toMatchObject({
      status: 500,
      code: 'unknown',
    });
  });
});
