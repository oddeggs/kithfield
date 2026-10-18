import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, cast, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import { quarantineMedia } from './quarantine';
import { mediaRow } from './index-store';
import { digestOf, readUrls, uploadPhoto, uploadUrl } from './support.test-data';

beforeEach(() => {
  useTestPorts();
});

const copy = (person: Parameters<typeof api>[0], body: unknown) =>
  api(person, 'POST', '/v1/media/copy', body);

/** Pip lives on two farms; Bea only on the second, so she can't read the first farm's media. */
const twoFarms = async () => {
  const { pip, bea, fig } = await cast('pip', 'bea', 'fig');
  const one = await plantFarm(pip, [fig]);
  const two = await plantFarm(pip, [bea]);
  return { pip, bea, fig, one: one.farm, two: two.farm };
};

describe('forwarding copies media', () => {
  it('copies finished media into the other farm, for its members to read', async () => {
    const { pip, bea, one, two } = await twoFarms();
    const key = await uploadPhoto(pip, one, 4096);
    expect(await readUrls(bea, [key])).toEqual([]);

    const res = await copy(pip, { fromFarm: one, keys: [key], farm: two });
    expect(res.status).toBe(200);
    const copied = (res.body as { keys: Record<string, string> }).keys[key] ?? '';
    expect(copied).toMatch(new RegExp(`^farm/${two}/[0-9a-f-]{36}$`));
    expect(await digestOf(await env.MEDIA.get(copied))).toBe(
      await digestOf(await env.MEDIA.get(key)),
    );
    expect(await mediaRow(env.DB, copied)).toMatchObject({
      farm_id: two,
      person_id: pip.id,
      kind: 'photo',
      bytes: 4096,
    });
    expect((await readUrls(bea, [copied])).map((u) => u.key)).toEqual([copied]);

    // Forwarding the same photo there again answers the same copy.
    const again = await copy(pip, { fromFarm: one, keys: [key], farm: two });
    expect((again.body as { keys: Record<string, string> }).keys[key]).toBe(copied);
    const listed = await env.MEDIA.list({ prefix: `farm/${two}/` });
    expect(listed.objects.map((o) => o.key)).toEqual([copied]);
  });

  it('needs the caller on both farms', async () => {
    const { pip, bea, fig, one, two } = await twoFarms();
    const key = await uploadPhoto(pip, one);
    expect((await copy(fig, { fromFarm: one, keys: [key], farm: two })).status).toBe(404);
    expect((await copy(bea, { fromFarm: one, keys: [key], farm: two })).status).toBe(404);
    expect((await copy(pip, { fromFarm: two, keys: [key], farm: one })).status).toBe(400);
  });

  it('never copies an unfinished or quarantined upload', async () => {
    const { pip, one, two } = await twoFarms();
    const unfinished = await uploadUrl(pip, {
      farm: one,
      kind: 'photo',
      bytes: 10,
      mime: 'image/png',
    });
    expect((await copy(pip, { fromFarm: one, keys: [unfinished.key], farm: two })).status).toBe(
      404,
    );
    const flagged = await uploadPhoto(pip, one);
    await quarantineMedia(env, { target: flagged, source: 'member', by: 'a', note: null, at: 1 });
    expect((await copy(pip, { fromFarm: one, keys: [flagged], farm: two })).status).toBe(404);
  });
});
