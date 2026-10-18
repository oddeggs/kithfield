import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Bindings } from '../env';
import { cast, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import { deleteFarmMedia, deletePersonMedia, forgetMedia } from './deletion';
import { isQuarantined, mediaRow } from './index-store';
import {
  evidenceKey,
  mediaAdminRoutes,
  quarantineMedia,
  registerUrgentReportOpener,
  type UrgentMediaReport,
} from './quarantine';
import { readUrls, uploadPhoto } from './support.test-data';

let opened: UrgentMediaReport[] = [];
let unregister: (() => void) | null = null;

beforeEach(() => {
  useTestPorts();
  opened = [];
  unregister = registerUrgentReportOpener((_env, report) => {
    opened.push(report);
    return Promise.resolve(`report-${opened.length}`);
  });
});
afterEach(() => unregister?.());

describe('quarantine', () => {
  it('stops reads, holds the evidence apart and opens one urgent report', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const key = await uploadPhoto(pip, farm);
    const [read] = await readUrls(fig, [key]);
    if (read === undefined) throw new Error('no read URL');

    // Cloudflare's notice names the URL it blocked.
    const first = await quarantineMedia(env, {
      target: read.url,
      source: 'hash_match',
      by: 'csam-scan',
      note: 'Cloudflare notice',
      at: Date.now(),
    });
    expect(first).toMatchObject({ key, first: true, held: true, report: 'report-1' });
    expect(opened).toEqual([
      expect.objectContaining({ farm, key, uploader: pip.id, source: 'hash_match' }),
    ]);
    expect(await isQuarantined(env.DB, key)).toBe(true);
    expect(await env.MEDIA.head(key)).toBeNull();
    expect((await env.MEDIA.head(evidenceKey(key)))?.customMetadata).toEqual({ from: key });
    expect(await readUrls(fig, [key])).toEqual([]);

    // Running it again (a retry, a second flag) changes nothing and opens nothing new.
    const again = await quarantineMedia(env, {
      target: key,
      source: 'member',
      by: 'admin-1',
      note: null,
      at: Date.now(),
    });
    expect(again).toMatchObject({ first: false, held: true, report: 'report-1' });
    expect(opened).toHaveLength(1);
    expect((await mediaRow(env.DB, key))?.report_id).toBe('report-1');
  });

  it('survives everything that deletes media: evidence is never deleted', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const key = await uploadPhoto(pip, farm);
    await quarantineMedia(env, { target: key, source: 'member', by: 'a', note: null, at: 1 });
    await forgetMedia(env.DB, [key]);
    await deletePersonMedia(env, pip.id);
    await deleteFarmMedia(env, farm);
    expect(await env.MEDIA.head(evidenceKey(key))).not.toBeNull();
    expect(await isQuarantined(env.DB, key)).toBe(true);
  });

  it('is offered to the moderation API as a route, with the acting admin', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const key = await uploadPhoto(pip, farm);
    const admin = new Hono<{ Bindings: Bindings }>().route(
      '/admin/v1',
      mediaAdminRoutes(() => 'admin-7'),
    );
    const post = (body: unknown) =>
      admin.request(
        '/admin/v1/media/quarantine',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        },
        env,
      );
    expect((await post({ key: 'farm/x' })).status).toBe(400);
    expect((await post({ url: 'https://media-dev.kithfield.com/elsewhere' })).status).toBe(400);
    const res = await post({ key, note: 'seen in a report' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ key, first: true, report: 'report-1' });
    expect(opened[0]).toMatchObject({ source: 'hash_match', note: 'seen in a report' });
  });
});

describe('deletion', () => {
  it('deletes everything a person uploaded, on every farm, and nobody else’s', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const one = await plantFarm(pip, [fig]);
    const two = await plantFarm(fig, [pip]);
    const mine = [await uploadPhoto(pip, one.farm), await uploadPhoto(pip, two.farm)];
    const theirs = await uploadPhoto(fig, one.farm);

    expect(await deletePersonMedia(env, pip.id)).toBe(2);
    for (const key of mine) {
      expect(await env.MEDIA.head(key)).toBeNull();
      expect(await mediaRow(env.DB, key)).toBeNull();
    }
    expect(await env.MEDIA.head(theirs)).not.toBeNull();
    // Running it again finds nothing left.
    expect(await deletePersonMedia(env, pip.id)).toBe(0);
  });

  it('forgets keys the farm deleted on unsend, so they are never signed again', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const key = await uploadPhoto(pip, farm);
    await env.MEDIA.delete(key);
    await forgetMedia(env.DB, [key]);
    expect(await mediaRow(env.DB, key)).toBeNull();
    expect(await readUrls(pip, [key])).toEqual([]);
  });
});
