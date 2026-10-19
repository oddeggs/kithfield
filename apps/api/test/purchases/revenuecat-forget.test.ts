import { describe, expect, it } from 'vitest';

import { forgetRevenueCatCustomer } from '../../src/purchases/revenuecat-forget';

const answering = (status: number) => {
  const asked: { url: string; method: string; auth: string | null }[] = [];
  const fetcher = ((input: string, init?: RequestInit) => {
    asked.push({
      url: input,
      method: init?.method ?? 'GET',
      auth: new Headers(init?.headers).get('authorization'),
    });
    return Promise.resolve(new Response(null, { status }));
  }) as unknown as typeof fetch;
  return { fetcher, asked };
};

describe("forgetting the person's RevenueCat customer", () => {
  it('deletes the customer named by the person id, with the secret key', async () => {
    const { fetcher, asked } = answering(200);
    const env = { REVENUECAT_SECRET_KEY: 'sk_test' };
    expect(await forgetRevenueCatCustomer(env, 'person/1', fetcher)).toBe('deleted');
    expect(asked).toEqual([
      {
        url: 'https://api.revenuecat.com/v1/subscribers/person%2F1',
        method: 'DELETE',
        auth: 'Bearer sk_test',
      },
    ]);
  });

  it('takes a customer RevenueCat never had as done, and throws on anything else', async () => {
    const env = { REVENUECAT_SECRET_KEY: 'sk_test' };
    expect(await forgetRevenueCatCustomer(env, 'p', answering(404).fetcher)).toBe('absent');
    await expect(forgetRevenueCatCustomer(env, 'p', answering(500).fetcher)).rejects.toThrow(
      'RevenueCat answered 500',
    );
  });

  it('does nothing without the secret key', async () => {
    const { fetcher, asked } = answering(200);
    expect(await forgetRevenueCatCustomer({}, 'p', fetcher)).toBe('skipped');
    expect(asked).toEqual([]);
  });
});
