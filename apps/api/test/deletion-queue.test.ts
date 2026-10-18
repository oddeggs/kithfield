import type { PersonMergedJob } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerPersonMergedStep } from '../src/deletion';
import worker from '../src/index';
import { cottageOf } from '../src/cottage/stub';
import { freshPerson, MIDDAY, useTestClock } from './cottage-doubles';

beforeEach(() => {
  useTestClock(MIDDAY);
});

/** What `getQueueResult` reports (its own type ships only with the experimental Workers types). */
interface QueueOutcome {
  readonly explicitAcks: string[];
  readonly retryMessages: { msgId: string }[];
}

/** Hands the Worker a batch on the deletion queue, as the queue would. */
async function consume(bodies: unknown[], attempts = 1) {
  const batch = createMessageBatch(
    'kithfield-deletion-dev',
    bodies.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts, body })),
  );
  const retries = batch.messages.map((message) => vi.spyOn(message, 'retry'));
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const result = (await getQueueResult(batch, ctx)) as unknown as QueueOutcome;
  return { ...result, delays: retries.map((spy) => spy.mock.calls[0]?.[0]?.delaySeconds) };
}

const merged = (from: string, into: string): PersonMergedJob => ({
  kind: 'person_merged',
  from,
  into,
  at: Date.now(),
});

describe('the deletion queue', () => {
  it('moves a merged person’s cottage into the kept person’s and acks', async () => {
    const from = freshPerson('anon');
    const into = freshPerson('june');
    await cottageOf(env, from).updateSettings({ lang: 'vi', timeZone: 'Asia/Ho_Chi_Minh' });
    const outcome = await consume([merged(from, into)]);
    expect(outcome.explicitAcks).toEqual(['m0']);
    expect(outcome.retryMessages).toEqual([]);
    expect((await cottageOf(env, into).settings()).settings).toMatchObject({
      lang: 'vi',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('runs a registered step with the job', async () => {
    const seen: PersonMergedJob[] = [];
    const remove = registerPersonMergedStep('farms-in-test', (_env, job) => {
      seen.push(job);
      return Promise.resolve();
    });
    try {
      const job = merged(freshPerson('anon'), freshPerson('june'));
      const outcome = await consume([job]);
      expect(outcome.explicitAcks).toEqual(['m0']);
      expect(seen).toEqual([job]);
    } finally {
      remove();
    }
  });

  it('refuses a second step under a name already taken', () => {
    const remove = registerPersonMergedStep('twice', () => Promise.resolve());
    try {
      expect(() => registerPersonMergedStep('twice', () => Promise.resolve())).toThrow();
    } finally {
      remove();
    }
  });

  it('retries a merge whose step fails, with back-off, so the dead-letter queue gets it last', async () => {
    const remove = registerPersonMergedStep('failing-in-test', () =>
      Promise.reject(new Error('farm unreachable')),
    );
    try {
      const outcome = await consume([merged(freshPerson('anon'), freshPerson('june'))], 2);
      expect(outcome.explicitAcks).toEqual([]);
      expect(outcome.retryMessages.map(({ msgId }) => msgId)).toEqual(['m0']);
      expect(outcome.delays).toEqual([60]);
    } finally {
      remove();
    }
  });

  it('acks a message it can’t read instead of retrying it forever', async () => {
    const outcome = await consume([
      { kind: 'account_deleted', person: 'p-1' },
      'not even an object',
      { kind: 'person_merged', from: 'p-1' },
    ]);
    expect(outcome.explicitAcks.sort()).toEqual(['m0', 'm1', 'm2']);
    expect(outcome.retryMessages).toEqual([]);
  });
});
