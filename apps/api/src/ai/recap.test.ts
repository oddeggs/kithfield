import { type RecapJob, WeeklyRecap } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { op } from '../../test/farm/support/client';
import { cast, type Person, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import worker from '../index';
import { checkLetter, type WeekFacts } from './letter';
import { RECAP_MODEL } from './models';
import { getAiRecap } from './recap';
import { localParts, nextSundayMorning, queueDueRecaps, queueRecap } from './schedule';
import { consent, deliver, ScriptedAi, watchAiQueue } from './support.test-data';

beforeEach(() => {
  useTestPorts();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The test farms' day: Sunday 18 October 2054, London (the test clock's start). */
const WEEK = '2054-10-18';

const said = (person: Person, n: number, text: string) => ({
  opId: op(n),
  kind: 'message' as const,
  payload: { text },
});

/** Pip and Bea said yes to the recap, Fig didn't; Pip and Fig tended this week, Bea didn't. */
async function aWeek() {
  const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
  const { farm, stub } = await plantFarm(pip, [fig, bea]);
  await consent(pip, 'recap');
  await consent(bea, 'recap');
  await consent(fig, 'recap', false);
  await stub.command(pip.id, said(pip, 1, 'Shall we have a picnic by the river this weekend?'));
  await stub.command(pip.id, { opId: op(2), kind: 'dewdrop', payload: { to: fig.id } });
  await stub.command(fig.id, said(fig, 3, 'Fig private words about the landlord'));
  return { pip, fig, bea, farm, stub };
}

const userPrompt = (ai: ScriptedAi, i = 0) => {
  const messages = ai.of(RECAP_MODEL)[i]?.input['messages'] as { content: string }[] | undefined;
  return messages?.[1]?.content ?? '';
};

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
      {
        title: 'A good week on {farm}',
        body: '{p1} dreamed up a riverside outing and sent dewdrops around.',
      },
    );
    expect((await deliver(ai, queued)).explicitAcks).toHaveLength(1);
    expect(ai.of(RECAP_MODEL)).toHaveLength(2);

    // What left: placeholders, kinds of care and the words of those who said yes. No names, no
    // counts, and nothing from Fig, who said no.
    const sent = userPrompt(ai);
    expect(JSON.parse(sent)).toEqual({
      farm: '{farm}',
      people: [{ who: '{p1}', care: ['messages', 'dewdrops'] }],
      messages: [{ from: '{p1}', text: 'Shall we have a picnic by the river this weekend?' }],
    });
    for (const absent of ['Pip', 'Fig', 'Bea', 'Thursday', 'landlord']) {
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
        body: 'Pip dreamed up a riverside outing and sent dewdrops around.',
      },
    });
    // It fits the rhythm feature's view.
    expect(
      WeeklyRecap.safeParse({ farm, week: WEEK, pollinator: null, thanks: [], plans: [], ...recap })
        .success,
    ).toBe(true);

    // Delivered again, nothing more is written.
    const again = new ScriptedAi();
    expect((await deliver(again, queued)).explicitAcks).toHaveLength(1);
    expect(again.calls).toEqual([]);
  });

  it('never keeps a letter that counts, ranks, quotes a message or names someone unknown', () => {
    const facts: WeekFacts = {
      farmName: 'The Thursday Lot',
      people: [{ person: 'p', name: 'Pip', tag: '{p1}', care: ['messages'] }],
      messages: [{ tag: '{p1}', text: 'Shall we have a picnic by the river this weekend?' }],
    };
    const letter = (title: string, body: string, lang: 'en' | 'vi' = 'en') =>
      checkLetter(JSON.stringify({ title, body }), facts, lang);
    expect(letter('A week on {farm}', '{p1} tended 3 plants.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} was the top gardener.')).toBeNull();
    expect(letter('A week on {farm}', '{p1} kept a streak going.')).toBeNull();
    expect(
      letter('A week on {farm}', '{p1} asked: a picnic by the river this weekend?'),
    ).toBeNull();
    expect(letter('A week on {farm}', '{p2} came too.')).toBeNull();
    expect(letter('Một tuần ở {farm}', '{p1} gửi hai lần giọt sương.', 'vi')).toBeNull();
    expect(letter('Một tuần ấm áp ở {farm}', '{p1} rủ mọi người đi dã ngoại.', 'vi')).toEqual({
      lang: 'vi',
      title: 'Một tuần ấm áp ở The Thursday Lot',
      body: 'Pip rủ mọi người đi dã ngoại.',
    });
    expect(checkLetter('Sure! ```json\n{"title": "x"}```', facts, 'en')).toBeNull();
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
    await deliver(
      new ScriptedAi().writes({ title: 'A good week on {farm}', body: '{p1} planned an outing.' }),
      queued,
    );
    expect((await getAiRecap(env, farm, WEEK)).letterState).toBe('written');
    const batch = createMessageBatch('kithfield-deletion-dev', [
      {
        id: 'f1',
        timestamp: new Date(),
        attempts: 1,
        body: { kind: 'consent_forget', person: pip.id, feature: 'recap', at: Date.now() },
      },
    ]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env, ctx);
    expect(((await getQueueResult(batch, ctx)) as { explicitAcks: string[] }).explicitAcks).toEqual(
      ['f1'],
    );
    expect(await getAiRecap(env, farm, WEEK)).toEqual({ letterState: 'none', letter: null });
  });
});

describe('when the letters are queued', () => {
  it('works out Sunday morning in the farm’s own time zone', () => {
    // 23:30 on Saturday in London is already Sunday morning in Hanoi.
    const at = Date.UTC(2054, 9, 17, 22, 30);
    expect(localParts(at, 'Europe/London')).toMatchObject({ date: '2054-10-17', weekday: 6 });
    const hanoi = localParts(at, 'Asia/Ho_Chi_Minh');
    expect(hanoi).toEqual({ date: '2054-10-18', weekday: 0, hour: 5, minute: 30 });
    expect(nextSundayMorning(at, hanoi)).toBe(Date.UTC(2054, 9, 18, 2, 0));
  });

  it('queues a farm’s letter once on Sunday morning, farm time', async () => {
    const queued = watchAiQueue();
    const { farm } = await aWeek();
    const mine = () => queued.filter((j) => (j as RecapJob).farm === farm);
    // First seen on a Sunday morning: it learns its zone, and waits for next Sunday.
    const seen = Date.UTC(2054, 9, 11, 8, 30);
    await queueDueRecaps(env, seen);
    expect(mine()).toEqual([]);
    const next = await env.DB.prepare('SELECT next_at FROM recap_schedule WHERE farm_id = ?')
      .bind(farm)
      .first<{ next_at: number }>();
    // 09:00 on Sunday 18 October in London (British Summer Time).
    expect(next?.next_at).toBe(Date.UTC(2054, 9, 18, 8, 0));
    await queueDueRecaps(env, Date.UTC(2054, 9, 18, 8, 7));
    expect(mine()).toEqual([
      expect.objectContaining({ kind: 'recap', farm, week: WEEK, langs: ['en'] }),
    ]);
    // The next hour finds it done for the week.
    await queueDueRecaps(env, Date.UTC(2054, 9, 18, 9, 7));
    expect(mine()).toHaveLength(1);
  });
});
