import { describe, expect, it } from '@jest/globals';

import { chatApiOf } from './chat-calls';

type Call = { method: string; path: string; body: unknown };

const fakeApi = (answers: Record<string, unknown>) => {
  const calls: Call[] = [];
  const request = ((_schema: unknown, method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const answer = answers[`${method} ${path}`];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer ?? null);
  }) as Parameters<typeof chatApiOf>[0]['request'];
  return { api: { request }, calls };
};

const settings = { mutedUntil: null, knockFor: { mentions: true } };

describe("the chat's calls", () => {
  it('goes through the API client, with the farm in the path', async () => {
    const { api, calls } = fakeApi({});
    await chatApiOf(api).search('farm one', 'picnic & cake');
    expect(calls).toEqual([
      {
        method: 'GET',
        path: '/v1/farms/farm%20one/search?q=picnic%20%26%20cake',
        body: undefined,
      },
    ]);
  });

  it('mutes by reading what knocks and writing it back muted', async () => {
    const { api, calls } = fakeApi({ 'GET /v1/farms/f/notifications': settings });
    await chatApiOf(api).setMuted('f', true);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /v1/farms/f/notifications',
      'PUT /v1/farms/f/notifications',
    ]);
    expect(calls[1]?.body).toEqual({ mutedUntil: 'always', knockFor: { mentions: true } });
  });

  it('writes nothing when what knocks cannot be read', async () => {
    const { api, calls } = fakeApi({ 'GET /v1/farms/f/notifications': new Error('not_found') });
    await expect(chatApiOf(api).setMuted('f', true)).rejects.toThrow('not_found');
    expect(calls).toHaveLength(1);
  });

  it('pins a chat with a patch', async () => {
    const { api, calls } = fakeApi({});
    await chatApiOf(api).setPinned('f', true);
    expect(calls).toEqual([{ method: 'PATCH', path: '/v1/chats/f', body: { pinned: true } }]);
  });
});
