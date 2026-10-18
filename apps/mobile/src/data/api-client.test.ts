import { describe, expect, it } from '@jest/globals';
import { BlockList } from '@kithfield/contracts';
import { z } from 'zod';

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

/** A server that answers each request with the next scripted answer, and keeps what it was sent. */
function scripted(...answers: { status: number; body?: unknown }[]) {
  const seen: { url: string; method: string; headers: Record<string, string>; body: unknown }[] =
    [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const answer = answers.shift() ?? { status: 500 };
    seen.push({
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const text = answer.body === undefined ? null : JSON.stringify(answer.body);
    return Promise.resolve(new Response(text, { status: answer.status }));
  };
  return { api: client(fetch), seen };
}

const BASE = 'https://test.kithfield.invalid/api';
const KEY = 'farm/f_lot/01900000-0000-4000-8000-000000000001';
const COPY = 'farm/f_den/01900000-0000-4000-8000-000000000002';
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

describe('the media calls', () => {
  it('asks for an upload URL and refuses one that isn’t the contract', async () => {
    const single = { upload: 'single', key: KEY, url: 'https://r2.test/put', expiresAt: 1 };
    const { api, seen } = scripted(
      { status: 200, body: single },
      { status: 200, body: { upload: 'single', key: 'not a key' } },
    );
    const request = { farm: 'f_lot', kind: 'photo', bytes: 10, mime: 'image/jpeg' } as const;
    expect(await api.uploadUrl(request)).toEqual(single);
    await expect(api.uploadUrl(request)).rejects.toBeInstanceOf(ApiError);
    expect(seen[0]).toMatchObject({
      url: `${BASE}/v1/media/upload-url`,
      method: 'POST',
      headers: { authorization: 'Bearer t' },
      body: request,
    });
  });

  it('completes, reads, copies and aborts, each on its own path', async () => {
    const { api, seen } = scripted(
      { status: 200, body: { key: KEY } },
      { status: 200, body: { urls: [{ key: KEY, url: 'https://r2.test/get', expiresAt: 2 }] } },
      { status: 200, body: { keys: { [KEY]: COPY } } },
      { status: 204 },
    );
    const parts = [{ part: 1, etag: 'e1' }];
    expect(await api.complete({ key: KEY, uploadId: 'u1', parts })).toEqual({ key: KEY });
    expect((await api.readUrls({ keys: [KEY] })).urls).toHaveLength(1);
    expect(await api.copyMedia({ fromFarm: 'f_lot', keys: [KEY], farm: 'f_den' })).toEqual({
      keys: { [KEY]: COPY },
    });
    expect(await api.abortUpload({ key: KEY, uploadId: 'u1' })).toBeNull();
    expect(seen.map((s) => s.url)).toEqual([
      `${BASE}/v1/media/complete`,
      `${BASE}/v1/media/read-urls`,
      `${BASE}/v1/media/copy`,
      `${BASE}/v1/media/abort`,
    ]);
    expect(seen[1]?.body).toEqual({ keys: [KEY] });
  });
});

describe('the way in', () => {
  it('answers ok for a passed age check and under_age when the server says so', async () => {
    const { api, seen } = scripted(
      { status: 204 },
      { status: 403, body: { error: { code: 'under_age', message: 'Under age' } } },
      { status: 400, body: { error: { code: 'bad_request', message: 'Bad' } } },
    );
    const age = { birthYear: 1990, country: 'VN' } as const;
    expect(await api.age(age)).toBe('ok');
    expect(await api.age(age)).toBe('under_age');
    await expect(api.age(age)).rejects.toMatchObject({ status: 400, code: 'bad_request' });
    expect(seen[0]).toMatchObject({ url: `${BASE}/v1/me/age`, method: 'POST', body: age });
  });

  it('accepts the Terms', async () => {
    const { api, seen } = scripted({ status: 204 });
    await expect(api.acceptTerms({ version: '2026-10-01' })).resolves.toBeUndefined();
    expect(seen[0]).toMatchObject({ url: `${BASE}/v1/me/terms`, body: { version: '2026-10-01' } });
  });

  it('previews an invite without the session, and answers null for a link that’s gone', async () => {
    const preview = {
      name: 'The Lot',
      from: { name: 'Bea', critter },
      land: 'meadow',
      critters: [critter],
      full: false,
      approval: false,
    };
    const { api, seen } = scripted(
      { status: 200, body: preview },
      { status: 404, body: { error: { code: 'invite_invalid', message: 'Gone' } } },
      { status: 503 },
    );
    expect(await api.invite('ab/cd')).toEqual(preview);
    expect(await api.invite('gone')).toBeNull();
    await expect(api.invite('later')).rejects.toMatchObject({ status: 503 });
    expect(seen[0]?.url).toBe(`${BASE}/v1/invites/ab%2Fcd`);
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.headers).not.toHaveProperty('authorization');
  });
});

describe('a session the server no longer knows', () => {
  it('re-checks the session on a signed-in call’s 401, retrying once only while it is live', async () => {
    let checks = 0;
    let live = true;
    const blocked = { blocked: [] };
    const answers = [
      { status: 401 },
      { status: 200, body: blocked },
      { status: 401 },
      { status: 401 },
      { status: 403 },
    ];
    let calls = 0;
    const api = createApiClient({
      baseUrl: BASE,
      fetch: () => {
        calls += 1;
        const answer = answers.shift() ?? { status: 500 };
        const text = JSON.stringify(answer.body ?? { error: { code: 'unauthorized' } });
        return Promise.resolve(new Response(text, { status: answer.status }));
      },
      authHeaders: () => Promise.resolve({ authorization: 'Bearer t' }),
      onUnauthorized: () => {
        checks += 1;
        return Promise.resolve(live);
      },
    });
    // A stale 401 while the session is live: one re-check, one retry.
    expect(await api.blocks()).toEqual(blocked);
    expect([checks, calls]).toEqual([1, 2]);
    // Confirmed gone: no retry, the 401 is thrown.
    live = false;
    await expect(api.blocks()).rejects.toMatchObject({ status: 401 });
    expect([checks, calls]).toEqual([2, 3]);
    // A signed-out call's 401, and a 403, ask for no re-check.
    await expect(api.invite('code')).rejects.toMatchObject({ status: 401 });
    await expect(api.me()).rejects.toMatchObject({ status: 403 });
    expect(checks).toBe(2);
  });
});

describe('any other signed-in call', () => {
  it('lists blocks, and makes a call the client has no method for, checked the same way', async () => {
    const blocked = { blocked: [{ person: 'p_pip', name: 'Pip', critter, at: 1 }] };
    const { api, seen } = scripted(
      { status: 200, body: blocked },
      { status: 204 },
      { status: 200, body: { nope: true } },
    );
    expect(await api.blocks()).toEqual(blocked);
    expect(await api.request(z.null(), 'PUT', '/v1/blocks/p_pip')).toBeNull();
    await expect(api.request(BlockList, 'GET', '/v1/blocks')).rejects.toBeInstanceOf(ApiError);
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      `GET ${BASE}/v1/blocks`,
      `PUT ${BASE}/v1/blocks/p_pip`,
      `GET ${BASE}/v1/blocks`,
    ]);
    expect(seen[1]?.headers).toMatchObject({ authorization: 'Bearer t' });
  });
});

describe('visits, Quick Tend and remembering', () => {
  it('opens a visit, reads Quick Tend and plants a seed', async () => {
    const { api, seen } = scripted(
      { status: 200, body: { farm: 'f_visit' } },
      { status: 200, body: { items: [] } },
      { status: 201, body: { id: 'r_1' } },
    );
    const visit = { person: 'p_pip', timeZone: 'Asia/Ho_Chi_Minh', hemisphere: 'north' } as const;
    expect(await api.openVisit(visit)).toEqual({ farm: 'f_visit' });
    expect(await api.quickTend()).toEqual({ items: [] });
    const seed = { farm: 'f_lot', about: 'p_pip', title: 'Interview', nudgeAt: 5 };
    expect(await api.remember(seed)).toEqual({ id: 'r_1' });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      `POST ${BASE}/v1/visits`,
      `GET ${BASE}/v1/quick-tend`,
      `POST ${BASE}/v1/remember`,
    ]);
    expect(seen[0]?.body).toEqual(visit);
  });
});
