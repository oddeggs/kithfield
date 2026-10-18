import { FarmEvent, type FarmState } from '@kithfield/contracts';
import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  getQueueResult,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETION_GRACE_MS } from '../src/auth/me';
import { type AccountDeletedJob, registerAccountDeletionStep } from '../src/auth/purge';
import { cottageOf } from '../src/cottage/stub';
import worker from '../src/index';
import { op } from './farm/support/client';
import { api, cast, pageOf, plantFarm, useTestPorts } from './farm/support/doubles';

beforeEach(() => {
  useTestPorts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** What `getQueueResult` reports (its own type ships only with the experimental Workers types). */
interface QueueOutcome {
  readonly explicitAcks: string[];
  readonly retryMessages: { msgId: string }[];
}

/** Hands the Worker a batch on the deletion queue, as the queue would. */
async function consume(bodies: unknown[]) {
  const batch = createMessageBatch(
    'kithfield-deletion-dev',
    bodies.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: 1, body })),
  );
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const result = (await getQueueResult(batch, ctx)) as unknown as QueueOutcome;
  return result;
}

/** Runs the daily cron and returns what it put on the deletion queue. */
async function dailyRun(): Promise<unknown[]> {
  const sent: unknown[] = [];
  vi.spyOn(env.DELETION_QUEUE, 'sendBatch').mockImplementation((messages) => {
    for (const m of messages) sent.push(m.body);
    return Promise.resolve({ metadata: {} } as unknown as QueueSendBatchResponse);
  });
  const ctx = createExecutionContext();
  worker.scheduled(
    createScheduledController({ scheduledTime: Date.now(), cron: '17 3 * * *' }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return sent;
}

const askedDaysAgo = async (person: string, days: number) => {
  await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
    .bind(Date.now() - days * 24 * 60 * 60_000, person)
    .run();
};

const count = async (sql: string, ...binds: unknown[]) =>
  (
    await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ n: number }>()
  )?.n ?? 0;

describe('the purge after 30 days', () => {
  it('queues only the people whose 30 days are over', async () => {
    const { due, waiting, staying } = await cast('due', 'waiting', 'staying');
    await askedDaysAgo(due.id, 31);
    await askedDaysAgo(waiting.id, 29);
    const queued = (await dailyRun()) as AccountDeletedJob[];
    const people = queued.map((j) => j.person);
    expect(people).toContain(due.id);
    expect(people).not.toContain(waiting.id);
    expect(people).not.toContain(staying.id);
    expect(queued.find((j) => j.person === due.id)).toMatchObject({ kind: 'account_deleted' });
  });

  it('tombstones the person on every farm, empties their cottage and deletes their rows, once', async () => {
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    const home = await plantFarm(pip, [fig]);
    const next = await plantFarm(kit, [fig]);
    await home.stub.command(fig.id, { opId: op(1), kind: 'message', payload: { text: 'bye' } });
    // Pip visits Kit's farm through Fig, and waves at the gate.
    const wave = { opId: op(2), gesture: { gesture: 'wave' } };
    expect((await api(pip, 'POST', `/v1/farms/${next.farm}/gate`, wave)).body).toMatchObject({
      result: 'ack',
    });
    await api(pip, 'PUT', `/v1/blocks/${kit.id}`);
    await api(kit, 'PUT', `/v1/blocks/${pip.id}`);
    await cottageOf(env, pip.id).updateSettings({ lang: 'vi' });
    await askedDaysAgo(pip.id, 31);
    const [job] = (await dailyRun()).filter(
      (j) => (j as AccountDeletedJob).person === pip.id,
    ) as AccountDeletedJob[];
    if (job === undefined) throw new Error('Pip was not queued');

    expect(await consume([job])).toMatchObject({ explicitAcks: ['m0'], retryMessages: [] });

    const homeLog = (await pageOf(home.stub, { limit: 50 })).events.map((e) => FarmEvent.parse(e));
    // Pip leaves, and the keeper's hat passes to Fig.
    expect(homeLog.slice(-2)).toMatchObject([
      { kind: 'left', actor: pip.id, payload: { how: 'account_deleted' } },
      { kind: 'settings_changed', actor: null, payload: { setting: 'role', person: fig.id } },
    ]);
    expect(homeLog.find((e) => e.kind === 'joined' && e.actor === pip.id)?.payload).toMatchObject({
      tombstone: 'author_deleted',
    });
    const state = (await home.stub.state()) as FarmState;
    expect(state.members.map((m) => [m.person, m.role])).toEqual([[fig.id, 'keeper']]);
    const nextLog = (await pageOf(next.stub, { limit: 50 })).events.map((e) => FarmEvent.parse(e));
    expect(nextLog.find((e) => e.kind === 'gate')?.payload).toMatchObject({
      tombstone: 'author_deleted',
    });
    expect(nextLog.at(-1)).toMatchObject({ kind: 'left', actor: pip.id });

    expect(await count('SELECT count(*) AS n FROM people WHERE id = ?', pip.id)).toBe(0);
    expect(await count('SELECT count(*) AS n FROM memberships WHERE person_id = ?', pip.id)).toBe(
      0,
    );
    expect(await count('SELECT count(*) AS n FROM farm_visitors WHERE person_id = ?', pip.id)).toBe(
      0,
    );
    expect(await count('SELECT count(*) AS n FROM blocks WHERE blocker_id = ?', pip.id)).toBe(0);
    // Kit's own block stays Kit's, drawn without a name now.
    const kitBlocks = await api(kit, 'GET', '/v1/blocks');
    expect(kitBlocks.body).toEqual({
      blocked: [{ person: pip.id, name: null, critter: null, at: expect.any(Number) as number }],
    });
    expect((await cottageOf(env, pip.id).settings()).settings.lang).toBe('en');

    // Running it again changes nothing.
    const heads = [homeLog.length, nextLog.length];
    expect(await consume([job])).toMatchObject({ explicitAcks: ['m0'] });
    expect((await pageOf(home.stub, { limit: 50 })).events).toHaveLength(heads[0] ?? 0);
    expect((await pageOf(next.stub, { limit: 50 })).events).toHaveLength(heads[1] ?? 0);
  });

  it('leaves alone someone who signed in again before the purge ran', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const home = await plantFarm(pip, [fig]);
    const job: AccountDeletedJob = { kind: 'account_deleted', person: pip.id, at: Date.now() };
    expect(await consume([job])).toMatchObject({ explicitAcks: ['m0'] });
    expect(await count('SELECT count(*) AS n FROM people WHERE id = ?', pip.id)).toBe(1);
    expect((await home.stub.state())?.members.map((m) => m.person)).toEqual([pip.id, fig.id]);
  });

  it('retries when a step fails, and keeps the person’s rows until every step is done', async () => {
    const { pip } = await cast('pip');
    await askedDaysAgo(pip.id, 31);
    const remove = registerAccountDeletionStep('failing-in-test', () =>
      Promise.reject(new Error('media unreachable')),
    );
    try {
      const job: AccountDeletedJob = { kind: 'account_deleted', person: pip.id, at: 0 };
      expect(await consume([job])).toMatchObject({ retryMessages: [{ msgId: 'm0' }] });
      expect(await count('SELECT count(*) AS n FROM people WHERE id = ?', pip.id)).toBe(1);
    } finally {
      remove();
    }
  });

  it('keeps nothing of the person on a farm they joined then left long ago', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const home = await plantFarm(pip, [fig]);
    await home.stub.command(fig.id, { opId: op(1), kind: 'message', payload: { text: 'hi' } });
    await home.stub.command(fig.id, { opId: op(2), kind: 'left', payload: {} });
    await askedDaysAgo(fig.id, 40);
    await consume([{ kind: 'account_deleted', person: fig.id, at: 0 }]);
    const words = (await pageOf(home.stub, { limit: 50 })).events
      .map((e) => FarmEvent.parse(e))
      .filter((e) => e.kind === 'message');
    expect(words.map((e) => e.payload)).toEqual([{ tombstone: 'author_deleted' }]);
  });
});

describe('the deletion grace', () => {
  it('is thirty days', () => {
    expect(DELETION_GRACE_MS).toBe(30 * 24 * 60 * 60_000);
  });
});
