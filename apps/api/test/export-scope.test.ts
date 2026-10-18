import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { expireExports, forgetExports } from '../src/auth/export';
import { writeBundle } from '../src/auth/export-bundle';
import type { Bindings } from '../src/env';
import { op } from './farm/support/client';
import { cast, hostOf, plantFarm, useTestPorts } from './farm/support/doubles';
import { text, unzip } from './support/zip';

beforeEach(() => {
  useTestPorts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const photo = (farm: string, n: number) =>
  `farm/${farm}/${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

/** Builds the person's bundle and reads its two lists back. */
async function bundleOf(person: string) {
  const key = `export/${person}/${crypto.randomUUID()}.zip`;
  await writeBundle(env, { person, key, at: Date.now() });
  const object = await env.MEDIA.get(key);
  const files = unzip(new Uint8Array(await (object as R2ObjectBody).arrayBuffer()));
  return {
    messages: JSON.parse(text(files.get('messages.json'))) as {
      farms: { farm: string; items: { text: string | null; media: string[] }[] }[];
    },
    media: JSON.parse(text(files.get('media.json'))) as {
      included: { key: string }[];
      missing: string[];
    },
  };
}

describe('what a keepsakes export takes', () => {
  it('includes the farms the person has left', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(fig, [pip]);
    await stub.command(pip.id, { opId: op(1), kind: 'message', payload: { text: 'so long' } });
    await stub.command(pip.id, { opId: op(2), kind: 'left', payload: {} });
    const { messages } = await bundleOf(pip.id);
    expect(messages.farms.map((f) => [f.farm, f.items.map((i) => i.text)])).toEqual([
      [farm, ['so long']],
    ]);
  });

  it('takes media only from the farm each event is on', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const mine = await plantFarm(pip);
    const theirs = await plantFarm(fig);
    const own = photo(mine.farm, 1);
    const foreign = photo(theirs.farm, 2);
    for (const key of [own, foreign]) await env.MEDIA.put(key, 'pixels');
    // Written past the command checks, as an older server might have let it in.
    await hostOf(mine.stub, (host) =>
      host.farm.write(
        pip.id,
        'media',
        {
          items: [
            { key: own, mime: 'image/jpeg', bytes: 6 },
            { key: foreign, mime: 'image/jpeg', bytes: 6 },
          ],
        },
        host.now(),
      ),
    );
    const { messages, media } = await bundleOf(pip.id);
    expect(messages.farms[0]?.items[0]?.media).toEqual([own]);
    expect(media.included.map((m) => m.key)).toEqual([own]);
  });
});

describe('cleaning up exports', () => {
  it('expires more bundles than R2 deletes at once', async () => {
    const { pip } = await cast('pip');
    const past = Date.now() - 1;
    const rows = Array.from({ length: 1001 }, (_, i) =>
      env.DB.prepare(
        `INSERT INTO exports (id, person_id, state, requested_at, ready_at, expires_at, r2_key)
         VALUES (?, ?, 'ready', 0, 0, ?, ?)`,
      ).bind(crypto.randomUUID(), pip.id, past, `export/${pip.id}/old-${i}.zip`),
    );
    await env.DB.batch(rows);
    expect(await expireExports(env, Date.now())).toBeGreaterThanOrEqual(1001);
    const left = await env.DB.prepare(
      "SELECT count(*) AS n FROM exports WHERE person_id = ? AND state = 'ready'",
    )
      .bind(pip.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it('forgets every bundle under the person, past one page of R2’s listing', async () => {
    const person = `p-many-${crypto.randomUUID().slice(0, 8)}`;
    await Promise.all(
      Array.from({ length: 1005 }, (_, i) => env.MEDIA.put(`export/${person}/${i}.zip`, 'z')),
    );
    await forgetExports(env, person);
    expect((await env.MEDIA.list({ prefix: `export/${person}/` })).objects).toEqual([]);
  });

  it('is unavailable with a link key shorter than 32 characters', async () => {
    const { pip } = await cast('pip');
    const bindings: Bindings = { ...env, EXPORT_URL_KEY: 'short' };
    const response = await createApp().fetch(
      new Request('https://dev.kithfield.com/api/v1/me/export', {
        method: 'POST',
        headers: { authorization: `Bearer ${pip.token}` },
      }),
      bindings,
      createExecutionContext(),
    );
    expect(response.status).toBe(503);
  });
});
