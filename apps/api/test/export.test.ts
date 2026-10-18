import { ErrorBody, ExportStatus } from '@kithfield/contracts';
import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  getQueueResult,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { forgetExports, signLink } from '../src/auth/export';
import { crc32 } from '../src/auth/export-zip';
import { readSignIn, sendCode, signInWithCode, watchLetters } from '../src/auth/testing/client';
import type { Bindings } from '../src/env';
import worker from '../src/index';
import { op } from './farm/support/client';
import { api, cast, type Person, plantFarm, useTestPorts } from './farm/support/doubles';

/** What the API put on the deletion queue, held back so the test hands it over. */
let queued: unknown[] = [];

beforeEach(() => {
  useTestPorts();
  queued = [];
  vi.spyOn(env.DELETION_QUEUE, 'send').mockImplementation((body: unknown) => {
    queued.push(structuredClone(body));
    return Promise.resolve({} as Awaited<ReturnType<Queue['send']>>);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** What `getQueueResult` reports (its own type ships only with the experimental Workers types). */
interface QueueOutcome {
  readonly explicitAcks: string[];
}

/** Hands the queued jobs to the Worker's deletion consumer, as the queue would. */
async function runQueued() {
  const batch = createMessageBatch(
    'kithfield-deletion-dev',
    queued.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: 1, body })),
  );
  queued = [];
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const outcome = (await getQueueResult(batch, ctx)) as unknown as QueueOutcome;
  return outcome;
}

async function status(person: Person, method: 'GET' | 'POST') {
  const answer = await api(person, method, '/v1/me/export');
  return { status: answer.status, body: answer.body };
}

/** The stored entries of a zip, read through its central directory, each CRC checked. */
function unzip(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const localName = view.getUint16(local + 26, true);
    const start = local + 30 + localName;
    const bytes = zip.subarray(start, start + size);
    expect(crc32(bytes)).toBe(crc);
    files.set(name, bytes);
    at += 46 + nameLength;
  }
  return files;
}

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

/** Pip and Fig on a farm, with Pip's words, an edit, an unsent message and a photo. */
async function farmWithKeepsakes() {
  const { pip, fig } = await cast('pip', 'fig');
  const { farm, stub } = await plantFarm(pip, [fig]);
  const key = `farm/${farm}/aaaa0000-0000-4000-8000-000000000000`;
  await env.MEDIA.put(key, 'pixels', { httpMetadata: { contentType: 'image/jpeg' } });
  const say = (n: number, who: Person, kind: string, payload: unknown) =>
    stub.command(who.id, { opId: op(n), kind, payload } as never);
  const first = await say(1, pip, 'message', { text: 'see you thursday' });
  const seq = first.result === 'ack' ? first.seq : 0;
  await say(2, pip, 'edit', { target: seq, text: 'see you friday' });
  const gone = await say(3, pip, 'message', { text: 'never mind' });
  await say(4, pip, 'unsend', { target: gone.result === 'ack' ? gone.seq : 0 });
  await say(5, fig, 'message', { text: 'fig’s own words' });
  await say(6, pip, 'media', {
    items: [{ key, mime: 'image/jpeg', bytes: 6 }],
    caption: 'the allotment',
  });
  return { pip, fig, farm, key };
}

describe('the keepsakes export', () => {
  it('has nothing to read before it is asked for', async () => {
    const { pip } = await cast('pip');
    const answer = await status(pip, 'GET');
    expect(answer.status).toBe(404);
    expect(ErrorBody.parse(answer.body).error.code).toBe('not_found');
  });

  it('prepares the zip on the queue, then hands out a link that downloads it', async () => {
    const { pip, farm, key } = await farmWithKeepsakes();
    const asked = await status(pip, 'POST');
    expect(asked.status).toBe(202);
    expect(ExportStatus.parse(asked.body)).toMatchObject({
      state: 'preparing',
      url: null,
      expiresAt: null,
    });
    expect(queued).toEqual([expect.objectContaining({ kind: 'export', person: pip.id })]);
    expect((await runQueued()).explicitAcks).toEqual(['m0']);

    const ready = ExportStatus.parse((await status(pip, 'GET')).body);
    expect(ready.state).toBe('ready');
    expect(ready.expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
    const download = await exports.default.fetch(ready.url ?? '');
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/zip');
    const files = unzip(new Uint8Array(await download.arrayBuffer()));

    const messages = JSON.parse(text(files.get('messages.json'))) as {
      farms: { farm: string; items: { kind: string; text: string | null; media: string[] }[] }[];
    };
    expect(messages.farms).toHaveLength(1);
    expect(messages.farms[0]?.farm).toBe(farm);
    expect(messages.farms[0]?.items.map((i) => [i.kind, i.text])).toEqual([
      ['message', 'see you friday'],
      ['media', 'the allotment'],
    ]);
    const media = JSON.parse(text(files.get('media.json'))) as { included: { file: string }[] };
    const file = media.included[0]?.file ?? '';
    expect(file).toBe(`media/${key.replace(/^farm\//, '')}.jpg`);
    expect(text(files.get(file))).toBe('pixels');
  });

  it('hands back the export already preparing or ready instead of starting another', async () => {
    const { pip } = await farmWithKeepsakes();
    const first = ExportStatus.parse((await status(pip, 'POST')).body);
    const again = ExportStatus.parse((await status(pip, 'POST')).body);
    expect(again.requestedAt).toBe(first.requestedAt);
    expect(queued).toHaveLength(1);
    await runQueued();
    const ready = ExportStatus.parse((await status(pip, 'POST')).body);
    expect(ready).toMatchObject({ state: 'ready', requestedAt: first.requestedAt });
    expect(queued).toHaveLength(0);
  });

  it('builds a bundle once, however often its job runs', async () => {
    const { pip } = await farmWithKeepsakes();
    await status(pip, 'POST');
    const job = queued[0];
    await runQueued();
    const ready = ExportStatus.parse((await status(pip, 'GET')).body);
    queued = [job];
    expect((await runQueued()).explicitAcks).toEqual(['m0']);
    expect(ExportStatus.parse((await status(pip, 'GET')).body).expiresAt).toBe(ready.expiresAt);
  });

  it('opens only for a link that holds and hasn’t run out', async () => {
    const { pip } = await farmWithKeepsakes();
    await status(pip, 'POST');
    await runQueued();
    const ready = ExportStatus.parse((await status(pip, 'GET')).body);
    const url = new URL(ready.url ?? '');
    const id = url.pathname.split('/').at(-2) ?? '';
    const tampered = new URL(url);
    tampered.searchParams.set('exp', String(Number(url.searchParams.get('exp')) + 1));
    expect((await exports.default.fetch(tampered.href)).status).toBe(404);
    const past = Date.now() - 1000;
    const late = new URL(url);
    late.searchParams.set('exp', String(past));
    late.searchParams.set('sig', await signLink(env.EXPORT_URL_KEY ?? '', id, past));
    expect((await exports.default.fetch(late.href)).status).toBe(404);
    const other = new URL(url.href.replace(id, crypto.randomUUID()));
    expect((await exports.default.fetch(other.href)).status).toBe(404);
  });

  it('runs out after a week: the daily job deletes the bundle', async () => {
    const { pip } = await farmWithKeepsakes();
    await status(pip, 'POST');
    await runQueued();
    const row = await env.DB.prepare('SELECT id, r2_key FROM exports WHERE person_id = ?')
      .bind(pip.id)
      .first<{ id: string; r2_key: string }>();
    await env.DB.prepare('UPDATE exports SET expires_at = ? WHERE id = ?')
      .bind(Date.now() - 1, row?.id)
      .run();
    expect(ExportStatus.parse((await status(pip, 'GET')).body)).toMatchObject({
      state: 'expired',
      url: null,
    });

    const ctx = createExecutionContext();
    worker.scheduled(createScheduledController({ scheduledTime: Date.now() }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await env.MEDIA.head(row?.r2_key ?? '')).toBeNull();
    const state = await env.DB.prepare('SELECT state FROM exports WHERE id = ?')
      .bind(row?.id)
      .first<{ state: string }>();
    expect(state?.state).toBe('expired');

    const fresh = ExportStatus.parse((await status(pip, 'POST')).body);
    expect(fresh.state).toBe('preparing');
    expect(queued).toHaveLength(1);
  });

  it('forgets every bundle with the account', async () => {
    const { pip } = await farmWithKeepsakes();
    await status(pip, 'POST');
    await runQueued();
    await forgetExports(env, pip.id);
    expect((await env.MEDIA.list({ prefix: `export/${pip.id}/` })).objects).toEqual([]);
    expect((await status(pip, 'GET')).status).toBe(404);
  });

  it('hands an install’s export to the account it signs in to', async () => {
    const email = `export.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const letters = watchLetters();
    await sendCode(email);
    const account = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
    const { anon } = await cast('anon');
    await status(anon, 'POST');
    await sendCode(email, { token: anon.token });
    await readSignIn(await signInWithCode(email, letters.codeFor(email), { token: anon.token }));
    const kept = { ...anon, id: account.user.id, token: account.token };
    expect(ExportStatus.parse((await status(kept, 'GET')).body).state).toBe('preparing');
  });

  it('is unavailable until the link key is set', async () => {
    const { pip } = await cast('pip');
    const { EXPORT_URL_KEY: _unset, ...rest } = env;
    const ctx = createExecutionContext();
    const response = await createApp().fetch(
      new Request('https://dev.kithfield.com/api/v1/me/export', {
        method: 'POST',
        headers: { authorization: `Bearer ${pip.token}` },
      }),
      rest satisfies Bindings,
      ctx,
    );
    expect(response.status).toBe(503);
  });
});
