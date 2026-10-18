import { describe, expect, it } from '@jest/globals';

import { ApiError, createApiClient, isTransient } from './api-client';

const client = (fetch: typeof globalThis.fetch, timeoutMs?: number) =>
  createApiClient({
    baseUrl: 'https://test.kithfield.invalid/api',
    fetch,
    authHeaders: () => Promise.resolve({ authorization: 'Bearer t' }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

describe('the API client', () => {
  it('gives up on a request that never answers', async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(client(hanging, 20).rtToken()).rejects.toThrow('aborted');
  });

  it('turns an error page that isn’t JSON into an ApiError', async () => {
    const page: typeof fetch = () =>
      Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await client(page)
      .rtToken()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'unknown' });
    expect(isTransient(error)).toBe(true);
  });

  it('treats a success that isn’t the contract as a failure', async () => {
    const odd: typeof fetch = () =>
      Promise.resolve(new Response('<html>hi</html>', { status: 200 }));
    await expect(client(odd).rtToken()).rejects.toBeInstanceOf(ApiError);
  });

  it('sends no cookies and keeps a history page whose events don’t parse', async () => {
    const seen: RequestInit[] = [];
    const ok: typeof fetch = (_input, init) => {
      if (init) seen.push(init);
      const body = JSON.stringify({ events: [{ seq: 'nope' }], more: false });
      return Promise.resolve(new Response(body, { status: 200 }));
    };
    const page = await client(ok).events('f_lot', { after: 0 });
    expect(page.events).toEqual([{ seq: 'nope' }]);
    expect(seen[0]?.credentials).toBe('omit');
  });

  it('moves in with an invite code, sent as typed and checked against the contract', async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const ok: typeof fetch = (input, init) => {
      seen.push({ url: input instanceof Request ? input.url : input.toString(), init });
      const body = JSON.stringify({ farm: 'f_lot', status: 'joined' });
      return Promise.resolve(new Response(body, { status: 200 }));
    };
    const critter = {
      species: 'rabbit',
      coat: 'cocoa',
      mark: null,
      accessory: null,
      outfit: null,
      outfitColor: null,
      companion: null,
      cottage: null,
    } as const;
    const joined = await client(ok).join('ab/cd', { name: 'Bea', critter });
    expect(joined).toEqual({ farm: 'f_lot', status: 'joined' });
    expect(seen[0]?.url).toBe('https://test.kithfield.invalid/api/v1/invites/ab%2Fcd/join');
    expect(seen[0]?.init?.method).toBe('POST');
    expect(JSON.parse(seen[0]?.init?.body as string)).toEqual({ name: 'Bea', critter });
  });

  it('sets the profile with PATCH and refuses an answer that isn’t a person', async () => {
    const methods: string[] = [];
    const odd: typeof fetch = (_input, init) => {
      methods.push(init?.method ?? '');
      return Promise.resolve(new Response(JSON.stringify({ name: 'Bea' }), { status: 200 }));
    };
    await expect(client(odd).updateProfile({ name: 'Bea' })).rejects.toBeInstanceOf(ApiError);
    expect(methods).toEqual(['PATCH']);
  });
});
