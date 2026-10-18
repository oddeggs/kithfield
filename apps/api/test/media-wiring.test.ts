import { QueuePage } from '@kithfield/contracts';
import { createMessageBatch } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { consumeDeletion } from '../src/deletion';
import { mediaRow } from '../src/media/index-store';
import { sweepMedia } from '../src/media/sweep';
import { readUrls, uploadPhoto } from '../src/media/support.test-data';
import { ANA, desk, type TestAccess, useTestAccess } from './admin/support';
import { op } from './farm/support/client';
import { cast, plantFarm, useTestPorts } from './farm/support/doubles';

/* Media as the rest of the API uses it: the farm's commits and unsends, the purge, and the desk. */

let access: TestAccess;
beforeEach(async () => {
  useTestPorts();
  access = await useTestAccess();
});

const WEEK = 7 * 24 * 60 * 60_000;

const photoMessage = (key: string) => ({
  kind: 'media' as const,
  payload: { items: [{ key, mime: 'image/jpeg', bytes: 2048 }] },
});

describe('media on the farm', () => {
  it('marks what a message points at, so the sweep keeps it and drops what was never sent', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const sent = await uploadPhoto(pip, farm);
    const unsent = await uploadPhoto(pip, farm);
    await readUrls(pip, [sent, unsent]); // marks both single PUTs finished
    const out = await stub.command(pip.id, { opId: op(1), ...photoMessage(sent) });
    expect(out).toMatchObject({ result: 'ack' });
    expect((await mediaRow(env.DB, sent))?.referenced_at).not.toBeNull();
    expect((await mediaRow(env.DB, unsent))?.referenced_at).toBeNull();

    const swept = await sweepMedia(env, Date.now() + WEEK + 60_000, { unreferenced: true });
    expect(swept.unsent).toBeGreaterThanOrEqual(1);
    expect(await env.MEDIA.head(sent)).not.toBeNull();
    expect(await env.MEDIA.head(unsent)).toBeNull();
    expect(await mediaRow(env.DB, unsent)).toBeNull();
  });

  it('forgets an unsent message’s media in the index, so it is never signed again', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const key = await uploadPhoto(pip, farm);
    const out = await stub.command(pip.id, { opId: op(1), ...photoMessage(key) });
    const seq = (out as { seq: number }).seq;
    expect(await readUrls(fig, [key])).toHaveLength(1);
    await stub.command(pip.id, { opId: op(2), kind: 'unsend', payload: { target: seq } });
    expect(await env.MEDIA.head(key)).toBeNull();
    expect(await mediaRow(env.DB, key)).toBeNull();
    expect(await readUrls(fig, [key])).toEqual([]);
  });
});

describe('media and an account purge', () => {
  it('deletes everything the person uploaded, sent or not, and leaves others’ media', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(fig, [pip]);
    const sent = await uploadPhoto(pip, farm);
    const kept = await uploadPhoto(pip, farm);
    const theirs = await uploadPhoto(fig, farm);
    await stub.command(pip.id, { opId: op(1), ...photoMessage(sent) });

    const asked = Date.now() - 31 * 24 * 60 * 60_000;
    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?').bind(asked, pip.id).run();
    const batch = createMessageBatch('kithfield-deletion-dev', [
      {
        id: 'm1',
        timestamp: new Date(),
        attempts: 1,
        body: { kind: 'account_deleted', person: pip.id, at: asked },
      },
    ]);
    const retried: unknown[] = [];
    for (const message of batch.messages) message.retry = (o) => retried.push(o);
    await consumeDeletion(batch, env);
    expect(retried).toEqual([]);

    for (const key of [sent, kept]) {
      expect(await env.MEDIA.head(key)).toBeNull();
      expect(await mediaRow(env.DB, key)).toBeNull();
    }
    expect(await env.MEDIA.head(theirs)).not.toBeNull();
  });
});

describe('quarantine from the desk', () => {
  it('holds the object and puts an urgent child-safety report on top of the queue', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const key = await uploadPhoto(pip, farm);
    const out = await desk(access, ANA, 'POST', '/media/quarantine', {
      key,
      note: 'notice 4471',
    });
    expect(out.status).toBe(200);
    const report = (out.body as { report: string }).report;
    const queue = QueuePage.parse((await desk(access, ANA, 'GET', '/queue')).body);
    expect(queue.rows[0]).toMatchObject({
      report,
      category: 'child_safety',
      urgent: true,
      source: 'hash_match',
      farm,
    });
    expect(await readUrls(fig, [key])).toEqual([]);
    // Without Access, nothing.
    expect(
      (
        await desk(
          { ...access, token: () => Promise.resolve('nope') },
          ANA,
          'POST',
          '/media/quarantine',
          { key },
        )
      ).status,
    ).toBe(401);
  });
});
