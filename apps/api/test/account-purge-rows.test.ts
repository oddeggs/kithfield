import { CreateFarmResponse, InvitePreview } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AccountDeletedJob, purgeAccount, queueDuePurges } from '../src/auth/purge';
import { watchLetters } from '../src/auth/testing/client';
import { cottageOf } from '../src/cottage/stub';
import { api, cast, useTestPorts } from './farm/support/doubles';
import { emailPerson } from './support/deletion';

beforeEach(() => {
  useTestPorts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DAY = 24 * 60 * 60_000;

const askedDaysAgo = async (person: string, days: number) => {
  await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
    .bind(Date.now() - days * DAY, person)
    .run();
};

const purge = (person: string) =>
  purgeAccount(env, { kind: 'account_deleted', person, at: 0 } satisfies AccountDeletedJob);

describe('what a purge leaves behind', () => {
  it('nothing of the person’s address: no pending sign-in code', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    const at = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO verifications (id, identifier, value, expires_at, created_at, updated_at)
       VALUES (?, ?, 'hashed', ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        `sign-in-otp-${email}`,
        new Date(Date.now() + DAY).toISOString(),
        at,
        at,
      )
      .run();
    await askedDaysAgo(person.id, 31);
    await purge(person.id);
    const left = await env.DB.prepare(
      'SELECT count(*) AS n FROM verifications WHERE identifier = ?',
    )
      .bind(`sign-in-otp-${email}`)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it('a farm’s invite link that still works, made by nobody now', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const created = await api(pip, 'POST', '/v1/farms', {
      name: 'The Thursday Lot',
      land: 'meadow',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    });
    const { farm, invite } = CreateFarmResponse.parse(created.body);
    await api(fig, 'POST', `/v1/invites/${invite.code}/join`, {
      name: 'Fig',
      critter: fig.critter,
    });
    await askedDaysAgo(pip.id, 31);
    await purge(pip.id);
    const row = await env.DB.prepare('SELECT created_by FROM invites WHERE farm_id = ?')
      .bind(farm)
      .first<{ created_by: string | null }>();
    expect(row).toEqual({ created_by: null });
    const preview = await api(null, 'GET', `/v1/invites/${invite.code}`);
    expect(InvitePreview.parse(preview.body).from).toBeNull();
  });

  it('a cottage that takes no late news', async () => {
    const { pip } = await cast('pip');
    await askedDaysAgo(pip.id, 31);
    await purge(pip.id);
    const cottage = cottageOf(env, pip.id);
    await cottage.upsertFarm({ farm: 'late-farm', farmKind: 'farm', name: 'Late', with: null });
    await cottage.deliver({
      farm: 'late-farm',
      seq: 9,
      kind: 'message',
      actor: 'someone',
      at: Date.now(),
      preview: 'are you there?',
      forYou: true,
      connected: false,
    });
    expect(await cottage.chatList()).toEqual([]);
    expect(await cottage.waiting()).toEqual([]);
  });
});

describe('queueing purges', () => {
  it('takes turns, so purges that keep failing don’t hold back the rest', async () => {
    const { first, second } = await cast('first', 'second');
    await askedDaysAgo(first.id, 60);
    await askedDaysAgo(second.id, 59);
    const queued: string[][] = [];
    vi.spyOn(env.DELETION_QUEUE, 'sendBatch').mockImplementation((messages) => {
      queued.push([...messages].map((m) => (m.body as AccountDeletedJob).person));
      return Promise.resolve({ metadata: {} } as unknown as QueueSendBatchResponse);
    });
    const run = async () => {
      queued.length = 0;
      await queueDuePurges(env, Date.now(), 1);
      return queued.flat();
    };
    // One a run here: the longest-waiting first, then whoever was queued least lately.
    expect(await run()).toEqual([first.id]);
    expect(await run()).toEqual([second.id]);
    expect(await run()).toEqual([first.id]);
  });
});
