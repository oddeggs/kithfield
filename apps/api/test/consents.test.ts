import { ConsentList } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type ConsentForgetJob, registerAiForgetStep } from '../src/auth/consents';
import { readSignIn, sendCode, signInWithCode, watchLetters } from '../src/auth/testing/client';
import worker from '../src/index';
import { api, newPerson, type Person } from './farm/support/doubles';

afterEach(() => {
  vi.restoreAllMocks();
});

const consents = async (person: Person) => {
  const listed = await api(person, 'GET', '/v1/me/consents');
  expect(listed.status).toBe(200);
  return ConsentList.parse(listed.body).consents;
};

/** Records what goes on the deletion queue instead of sending it to the local queue. */
const watchQueue = () => {
  const sent: unknown[] = [];
  vi.spyOn(env.DELETION_QUEUE, 'send').mockImplementation((body) => {
    sent.push(body);
    return Promise.resolve({ metadata: {} } as unknown as QueueSendResponse);
  });
  return sent;
};

describe('consent for the AI features', () => {
  it('records each answer with its text version and lists them', async () => {
    const pip = await newPerson('pip');
    expect(await consents(pip)).toEqual([]);
    const put = (feature: string, body: unknown) =>
      api(pip, 'PUT', `/v1/me/consents/${feature}`, body);
    expect((await put('captions', { allowed: true, textVersion: '2026-10' })).status).toBe(204);
    expect((await put('recap', { allowed: false, textVersion: '2026-10' })).status).toBe(204);
    expect((await put('captions', { allowed: false, textVersion: '2026-11' })).status).toBe(204);
    expect((await consents(pip)).map((c) => [c.feature, c.allowed, c.textVersion])).toEqual([
      ['captions', false, '2026-11'],
      ['recap', false, '2026-10'],
    ]);
    expect((await put('mindreading', { allowed: true, textVersion: '1' })).status).toBe(404);
    expect((await put('recap', { allowed: 'yes' })).status).toBe(400);
    expect((await api(null, 'GET', '/v1/me/consents')).status).toBe(401);
  });

  it('withdraws the consent at once on forget and queues the deletion of what was sent', async () => {
    const sent = watchQueue();
    const pip = await newPerson('pip');
    await api(pip, 'PUT', '/v1/me/consents/captions', { allowed: true, textVersion: '2026-10' });
    const forget = await api(pip, 'POST', '/v1/me/consents/captions/forget');
    expect(forget.status).toBe(202);
    expect(await consents(pip)).toEqual([
      expect.objectContaining({ feature: 'captions', allowed: false, textVersion: '2026-10' }),
    ]);
    expect(sent).toEqual([
      {
        kind: 'consent_forget',
        person: pip.id,
        feature: 'captions',
        at: expect.any(Number) as number,
      },
    ]);
    // Forgetting a feature never answered still records a no.
    expect((await api(pip, 'POST', '/v1/me/consents/recap/forget')).status).toBe(202);
    expect((await consents(pip)).find((c) => c.feature === 'recap')?.allowed).toBe(false);
  });

  it('runs every step the AI features registered when the job comes off the queue', async () => {
    const seen: ConsentForgetJob[] = [];
    const remove = registerAiForgetStep('captions-in-test', (_env, job) => {
      seen.push(job);
      return Promise.resolve();
    });
    try {
      const job: ConsentForgetJob = {
        kind: 'consent_forget',
        person: 'p-forget',
        feature: 'recap',
        at: 1,
      };
      const batch = createMessageBatch('kithfield-deletion-dev', [
        { id: 'm0', timestamp: new Date(), attempts: 1, body: job },
      ]);
      const ctx = createExecutionContext();
      await worker.queue(batch, env, ctx);
      const outcome = (await getQueueResult(batch, ctx)) as unknown as { explicitAcks: string[] };
      expect(outcome.explicitAcks).toEqual(['m0']);
      expect(seen).toEqual([job]);
    } finally {
      remove();
    }
  });

  it('keeps the returning person’s answers across a merge, and takes the rest from the install', async () => {
    const email = `consents.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const letters = watchLetters();
    await sendCode(email);
    const account = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
    const returning: Person = {
      ...(await newPerson('wren')),
      id: account.user.id,
      token: account.token,
    };
    await api(returning, 'PUT', '/v1/me/consents/captions', { allowed: false, textVersion: 'a' });
    const anon = await newPerson('anon');
    await api(anon, 'PUT', '/v1/me/consents/captions', { allowed: true, textVersion: 'b' });
    await api(anon, 'PUT', '/v1/me/consents/recap', { allowed: true, textVersion: 'b' });
    await sendCode(email, { token: anon.token });
    await readSignIn(await signInWithCode(email, letters.codeFor(email), { token: anon.token }));
    expect((await consents(returning)).map((c) => [c.feature, c.allowed, c.textVersion])).toEqual([
      ['captions', false, 'a'],
      ['recap', true, 'b'],
    ]);
  });
});
