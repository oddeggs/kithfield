import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, cast, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import { deletePersonMedia } from './deletion';
import { mediaRow } from './index-store';
import { quarantineMedia } from './quarantine';
import { PART_BYTES } from './rules';
import { uploadPhoto, uploadUrl } from './support.test-data';
import { markMediaReferenced, sweepMedia } from './sweep';

beforeEach(() => {
  useTestPorts();
});

const DAY = 24 * 60 * 60_000;

describe('the daily media sweep', () => {
  it('drops uploads left unfinished for a week, and leaves recent ones alone', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const parts = await uploadUrl(pip, {
      farm,
      kind: 'video',
      bytes: 6 * PART_BYTES,
      mime: 'video/mp4',
    });
    const never = await uploadUrl(pip, { farm, kind: 'photo', bytes: 10, mime: 'image/png' });
    const done = await uploadPhoto(pip, farm);

    await sweepMedia(env, Date.now() + DAY);
    expect(await mediaRow(env.DB, parts.key)).not.toBeNull();

    await sweepMedia(env, Date.now() + 8 * DAY);
    expect(await mediaRow(env.DB, parts.key)).toBeNull();
    expect(await mediaRow(env.DB, never.key)).toBeNull();
    // A single PUT that did land is finished, not abandoned.
    expect((await mediaRow(env.DB, done))?.completed_at).not.toBeNull();
    expect(await env.MEDIA.head(done)).not.toBeNull();
  });

  it('deletes finished uploads nothing ever pointed at, when asked to', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const sent = await uploadPhoto(pip, farm);
    const unsent = await uploadPhoto(pip, farm);
    const flagged = await uploadPhoto(pip, farm);
    await markMediaReferenced(env.DB, [sent], Date.now());
    await quarantineMedia(env, { target: flagged, source: 'member', by: 'a', note: null, at: 1 });

    await sweepMedia(env, Date.now() + 8 * DAY);
    expect(await env.MEDIA.head(unsent)).not.toBeNull();

    await sweepMedia(env, Date.now() + 8 * DAY, { unreferenced: true });
    expect(await env.MEDIA.head(unsent)).toBeNull();
    expect(await mediaRow(env.DB, unsent)).toBeNull();
    expect(await env.MEDIA.head(sent)).not.toBeNull();
    expect((await mediaRow(env.DB, flagged))?.quarantined_at).not.toBeNull();
  });
});

describe('account deletion', () => {
  it('also forgets the person’s forwarding copies', async () => {
    const { pip } = await cast('pip');
    const one = await plantFarm(pip);
    const two = await plantFarm(pip);
    const key = await uploadPhoto(pip, one.farm);
    const res = await api(pip, 'POST', '/v1/media/copy', {
      fromFarm: one.farm,
      keys: [key],
      farm: two.farm,
    });
    expect(res.status).toBe(200);
    await deletePersonMedia(env, pip.id);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM media_copies WHERE person_id = ?')
      .bind(pip.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
