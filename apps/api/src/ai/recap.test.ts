import { type RecapJob, WeeklyRecap } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { op } from '../../test/farm/support/client';
import { cast, type Person, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import worker from '../index';
import { RECAP_MODEL } from './models';
import { getAiRecap } from './recap';
import { queueRecap } from './schedule';
import { letterKey } from './store';
import { consent, deliver, ScriptedAi, watchAiQueue } from './support.test-data';

beforeEach(() => {
  useTestPorts();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The test farms' day: Sunday 18 October 2054, London (the test clock's start). */
const WEEK = '2054-10-18';

let ops = 0;
const said = (text: string, extra: object = {}) => ({
  opId: op(100 + ops++),
  kind: 'message' as const,
  payload: { text, ...extra },
});

/**
 * Pip and Bea said yes to the recap, Fig didn't, Mo left. Pip and Fig tended this week, Bea
 * didn't.
 */
async function aWeek() {
  const { pip, fig, bea, mo } = await cast('pip', 'fig', 'bea', 'mo');
  const { farm, stub } = await plantFarm(pip, [fig, bea, mo]);
  await consent(pip, 'recap');
  await consent(bea, 'recap');
  await consent(mo, 'recap');
  await consent(fig, 'recap', false);
  await stub.command(pip.id, said('Shall we have a picnic by the river this weekend?'));
  await stub.command(pip.id, { opId: op(2), kind: 'dewdrop', payload: { to: fig.id } });
  await stub.command(fig.id, said('Fig private words about the landlord'));
  await stub.command(mo.id, said('Mo words before leaving'));
  await stub.command(mo.id, { opId: op(4), kind: 'left', payload: {} });
  return { pip, fig, bea, mo, farm, stub };
}

const userPrompt = (ai: ScriptedAi, i = 0) => {
  const messages = ai.of(RECAP_MODEL)[i]?.input['messages'] as { content: string }[] | undefined;
  return messages?.[1]?.content ?? '';
};

const forget = async (person: Person) => {
  const batch = createMessageBatch('kithfield-deletion-dev', [
    {
      id: `f-${person.id}`,
      timestamp: new Date(),
      attempts: 1,
      body: { kind: 'consent_forget', person: person.id, feature: 'recap', at: Date.now() },
    },
  ]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  return (await getQueueResult(batch, ctx)) as { explicitAcks: string[] };
};

const good = { title: 'A good week on {farm}', body: '{p1} dreamed up an outing.' };

describe('the Sunday recap letter', () => {
  it('queues nothing when nobody on the farm said yes', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    await consent(pip, 'recap', false);
    expect(await queueRecap(env, farm, WEEK, Date.now())).toBe(false);
    expect(queued).toEqual([]);
    expect(await getAiRecap(env, farm, WEEK, 'en')).toEqual({ letterState: 'none', letter: null });
  });

  it('writes a warm letter from the words of friends who said yes, with no counts', async () => {
    const queued = watchAiQueue();
    const { farm } = await aWeek();
    expect(await queueRecap(env, farm, WEEK, Date.now())).toBe(true);
    expect(queued).toEqual([
      { kind: 'recap', farm, week: WEEK, langs: ['en'], at: expect.any(Number) as number },
    ] satisfies RecapJob[]);
    expect(await getAiRecap(env, farm, WEEK, 'en')).toEqual({
      letterState: 'writing',
      letter: null,
    });

    const ai = new ScriptedAi().writes(
      // Counting care breaks the house rules: written again.
      { title: 'A busy week on {farm}', body: '{p1} sent three dewdrops, more than anyone.' },
      { title: 'A good week on {farm}', body: '{p1} dreamed up a riverside outing.' },
    );
    expect((await deliver(ai, queued)).explicitAcks).toHaveLength(1);
    expect(ai.of(RECAP_MODEL)).toHaveLength(2);

    // What left: placeholders, kinds of care and the words of those who said yes and live here.
    // No names, no counts, nothing from Fig, who said no, or Mo, who left.
    const sent = userPrompt(ai);
    expect(JSON.parse(sent)).toEqual({
      farm: '{farm}',
      people: [{ who: '{p1}', care: ['messages', 'dewdrops'] }],
      messages: [{ from: '{p1}', text: 'Shall we have a picnic by the river this weekend?' }],
    });
    for (const absent of ['Pip', 'Fig', 'Bea', 'Mo', 'Thursday', 'landlord', 'leaving']) {
      expect(sent).not.toContain(absent);
    }
    // Beyond the placeholders' own numbering, not a number anywhere.
    expect(sent.replace(/\{p\d+\}/g, '')).not.toMatch(/\d/);

    const recap = await getAiRecap(env, farm, WEEK, 'en');
    expect(recap).toEqual({
      letterState: 'written',
      letter: {
        lang: 'en',
        title: 'A good week on The Thursday Lot',
        body: 'Pip dreamed up a riverside outing.',
      },
    });
    expect(
      WeeklyRecap.safeParse({ farm, week: WEEK, pollinator: null, thanks: [], plans: [], ...recap })
        .success,
    ).toBe(true);

    // Delivered again, nothing more is written.
    const again = new ScriptedAi();
    expect((await deliver(again, queued)).explicitAcks).toHaveLength(1);
    expect(again.calls).toEqual([]);
  });

  it('never names a friend who said no or who left, even when the model does', async () => {
    const queued = watchAiQueue();
    const { farm } = await aWeek();
    await queueRecap(env, farm, WEEK, Date.now());
    const ai = new ScriptedAi().writes(
      { title: 'A good week on {farm}', body: '{p1} and Fig planned an outing.' },
      { title: 'A good week on {farm}', body: '{p1} missed Mo.' },
      good,
    );
    await deliver(ai, queued);
    expect(ai.of(RECAP_MODEL)).toHaveLength(3);
    expect((await getAiRecap(env, farm, WEEK, 'en')).letter?.body).toBe(
      'Pip dreamed up an outing.',
    );
  });

  it('reads messages as last edited, and leaves forwarded words out', async () => {
    const queued = watchAiQueue();
    const { pip, stub, farm } = await aWeek();
    const first = await stub.command(pip.id, said('Old words before the edit'));
    await stub.command(pip.id, {
      opId: op(50),
      kind: 'edit',
      payload: { target: (first as { seq: number }).seq, text: 'Fresh words after the edit' },
    });
    await stub.command(
      pip.id,
      said('A forwarded line from another farm', {
        forwardedFrom: { farm: 'elsewhere0000000000000', seq: 3 },
      }),
    );
    await queueRecap(env, farm, WEEK, Date.now());
    const ai = new ScriptedAi().writes(good);
    await deliver(ai, queued);
    const sent = userPrompt(ai);
    expect(sent).toContain('Fresh words after the edit');
    expect(sent).not.toContain('Old words');
    expect(sent).not.toContain('forwarded line');
  });

  it('deletes the letter when consent is withdrawn between its write and the last look', async () => {
    const queued = watchAiQueue();
    const { pip, farm } = await aWeek();
    await queueRecap(env, farm, WEEK, Date.now());
    const put = env.MEDIA.put.bind(env.MEDIA);
    vi.spyOn(env.MEDIA, 'put').mockImplementation(async (key, value, options) => {
      const written = await put(key, value, options);
      await consent(pip, 'recap', false);
      return written;
    });
    // It is never marked written, not even for a moment.
    const prepare = env.DB.prepare.bind(env.DB);
    const statements: string[] = [];
    vi.spyOn(env.DB, 'prepare').mockImplementation((sql) => {
      statements.push(sql);
      return prepare(sql);
    });
    await deliver(new ScriptedAi().writes(good), queued);
    expect(statements.filter((sql) => sql.includes("state = 'written'"))).toEqual([]);
    expect(await getAiRecap(env, farm, WEEK, 'en')).toEqual({ letterState: 'none', letter: null });
    expect(await env.MEDIA.head(letterKey(farm, WEEK, 'en'))).toBeNull();
  });

  it('deletes words written for a letter forgotten meanwhile', async () => {
    const queued = watchAiQueue();
    const { pip, farm } = await aWeek();
    await queueRecap(env, farm, WEEK, Date.now());
    const put = env.MEDIA.put.bind(env.MEDIA);
    vi.spyOn(env.MEDIA, 'put').mockImplementation(async (key, value, options) => {
      // The forget lands just as the letter is written; Pip has said yes again since.
      await forget(pip);
      await consent(pip, 'recap');
      return put(key, value, options);
    });
    await deliver(new ScriptedAi().writes(good), queued);
    expect(await getAiRecap(env, farm, WEEK, 'en')).toEqual({ letterState: 'none', letter: null });
    expect(await env.MEDIA.head(letterKey(farm, WEEK, 'en'))).toBeNull();
  });

  it('gives up after its tries, so the app writes its own letter', async () => {
    const queued = watchAiQueue();
    const { farm } = await aWeek();
    await queueRecap(env, farm, WEEK, Date.now());
    const counting = { title: 'Top of {farm}', body: '{p1} won.' };
    const ai = new ScriptedAi().writes(counting, counting, counting, counting, counting, counting);
    expect((await deliver(ai, queued, 1)).retryMessages).toHaveLength(1);
    expect(await getAiRecap(env, farm, WEEK, 'en')).toMatchObject({ letterState: 'writing' });
    expect((await deliver(ai, queued, 4)).explicitAcks).toHaveLength(1);
    expect(await getAiRecap(env, farm, WEEK, 'en')).toEqual({ letterState: 'none', letter: null });
  });

  it('deletes the letters made from someone’s words when they ask to forget', async () => {
    const queued = watchAiQueue();
    const { pip, farm } = await aWeek();
    await queueRecap(env, farm, WEEK, Date.now());
    await deliver(new ScriptedAi().writes(good), queued);
    expect((await getAiRecap(env, farm, WEEK)).letterState).toBe('written');
    expect((await forget(pip)).explicitAcks).toEqual([`f-${pip.id}`]);
    expect(await getAiRecap(env, farm, WEEK)).toEqual({ letterState: 'none', letter: null });
    expect(await env.MEDIA.head(letterKey(farm, WEEK, 'en'))).toBeNull();
  });
});
