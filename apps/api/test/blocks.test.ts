import { BlockList, type CottageDelivery, ErrorBody } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSignIn, sendCode, signInWithCode, watchLetters } from '../src/auth/testing/client';
import { cottageClock } from '../src/cottage/clock';
import {
  cottageWithFarm,
  ledgerOf,
  MIDDAY,
  recordPushQueue,
  useTestClock,
} from './cottage-doubles';
import { api, cast, newPerson } from './farm/support/doubles';

beforeEach(() => {
  useTestClock(MIDDAY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const blocked = async (who: Parameters<typeof api>[0]) => {
  const listed = await api(who, 'GET', '/v1/blocks');
  expect(listed.status).toBe(200);
  return BlockList.parse(listed.body).blocked;
};

describe('blocking', () => {
  it('lists who the person blocked, newest first, with how to draw them', async () => {
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    expect(await blocked(pip)).toEqual([]);
    expect((await api(pip, 'PUT', `/v1/blocks/${fig.id}`)).status).toBe(204);
    expect((await api(pip, 'PUT', `/v1/blocks/${kit.id}`)).status).toBe(204);
    const list = await blocked(pip);
    expect(list.map((b) => [b.person, b.name, b.critter?.species])).toEqual([
      [kit.id, 'Kit', 'cat'],
      [fig.id, 'Fig', 'frog'],
    ]);
    // Nobody sees who blocked them.
    expect(await blocked(fig)).toEqual([]);
  });

  it('keeps the first time on a second block, and unblocks quietly even when nothing was blocked', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    await api(pip, 'PUT', `/v1/blocks/${fig.id}`);
    const [first] = await blocked(pip);
    expect((await api(pip, 'PUT', `/v1/blocks/${fig.id}`)).status).toBe(204);
    expect((await blocked(pip))[0]?.at).toBe(first?.at);
    expect((await api(pip, 'DELETE', `/v1/blocks/${fig.id}`)).status).toBe(204);
    expect((await api(pip, 'DELETE', `/v1/blocks/${fig.id}`)).status).toBe(204);
    expect(await blocked(pip)).toEqual([]);
  });

  it('draws a blocked person whose account was deleted without a name or critter', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    await api(pip, 'PUT', `/v1/blocks/${fig.id}`);
    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
      .bind(Date.now(), fig.id)
      .run();
    const [entry] = await blocked(pip);
    expect(entry).toMatchObject({ person: fig.id, name: null, critter: null });
  });

  it('turns down blocking oneself, someone unknown, or without a session', async () => {
    const pip = await newPerson('pip');
    const self = await api(pip, 'PUT', `/v1/blocks/${pip.id}`);
    expect(self.status).toBe(400);
    expect(ErrorBody.parse(self.body).error.code).toBe('bad_request');
    expect((await api(pip, 'PUT', '/v1/blocks/nobody-at-all')).status).toBe(404);
    expect((await api(null, 'GET', '/v1/blocks')).status).toBe(401);
    expect((await api(null, 'PUT', `/v1/blocks/${pip.id}`)).status).toBe(401);
  });
});

describe('a blocked person’s news in the blocker’s cottage', () => {
  const delivery = (farm: string, actor: string, seq: number): CottageDelivery => ({
    farm,
    seq,
    kind: 'firefly',
    actor,
    at: cottageClock.now(),
    preview: null,
    forYou: true,
    connected: false,
  });

  it('neither waits in Quick Tend nor pushes, while the chat row still follows the farm', async () => {
    const queue = recordPushQueue();
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    await api(pip, 'PUT', `/v1/blocks/${fig.id}`);
    const farm = `farm-blocks-${crypto.randomUUID().slice(0, 8)}`;
    const cottage = await cottageWithFarm(pip.id, farm);
    await cottage.deliver(delivery(farm, fig.id, 2));
    expect(queue.jobs()).toEqual([]);
    expect(await cottage.waiting()).toEqual([]);
    expect((await cottage.chatList())[0]).toMatchObject({ farm, seq: 2, actor: fig.id });

    await cottage.deliver(delivery(farm, kit.id, 3));
    expect(queue.jobs()).toEqual([expect.objectContaining({ person: pip.id, seq: 3 })]);
    expect((await cottage.waiting()).map((w) => w.seq)).toEqual([3]);
    expect((await ledgerOf(pip.id)).map((r) => r['seq'])).toEqual([3]);
  });

  it('only counts the blocker’s own blocks: being blocked doesn’t quiet one’s own cottage', async () => {
    const queue = recordPushQueue();
    const { pip, fig } = await cast('pip', 'fig');
    await api(fig, 'PUT', `/v1/blocks/${pip.id}`);
    const farm = `farm-blocks-${crypto.randomUUID().slice(0, 8)}`;
    await (await cottageWithFarm(pip.id, farm)).deliver(delivery(farm, fig.id, 2));
    expect(queue.jobs()).toEqual([expect.objectContaining({ person: pip.id, seq: 2 })]);
  });
});

describe('blocks across a merge', () => {
  it('moves an anonymous person’s blocks, and blocks of them, to the account they signed in to', async () => {
    const email = `blocks.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const letters = watchLetters();
    await sendCode(email);
    const account = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
    const { anon, fig, kit } = await cast('anon', 'fig', 'kit');
    await api(anon, 'PUT', `/v1/blocks/${fig.id}`);
    await api(kit, 'PUT', `/v1/blocks/${anon.id}`);
    await sendCode(email, { token: anon.token });
    await readSignIn(await signInWithCode(email, letters.codeFor(email), { token: anon.token }));
    const into = { ...anon, id: account.user.id, token: account.token };
    expect((await blocked(into)).map((b) => b.person)).toEqual([fig.id]);
    expect((await blocked(kit)).map((b) => b.person)).toEqual([account.user.id]);
    const left = await env.DB.prepare(
      'SELECT count(*) AS n FROM blocks WHERE blocker_id = ?1 OR blocked_id = ?1',
    )
      .bind(anon.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
