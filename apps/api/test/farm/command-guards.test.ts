import { beforeEach, describe, expect, it } from 'vitest';

import { op } from './support/client';
import { api, cast, plantFarm, useTestPorts } from './support/doubles';

beforeEach(() => {
  useTestPorts();
});

const photo = (farm: string, n: number) => ({
  key: `farm/${farm}/${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`,
  mime: 'image/jpeg',
  bytes: 6,
});

describe('gestures between people where one blocked the other', () => {
  it('turns away a firefly, knock or hug either way, and lets the rest of the chat through', async () => {
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    const { stub } = await plantFarm(pip, [fig, kit]);
    expect((await api(pip, 'PUT', `/v1/blocks/${fig.id}`)).status).toBe(204);
    const firefly = await stub.command(fig.id, {
      opId: op(1),
      kind: 'firefly',
      payload: { action: 'left', to: pip.id },
    });
    expect(firefly).toEqual({ result: 'rejected', opId: op(1), reason: 'unavailable' });
    const knock = await stub.command(pip.id, {
      opId: op(2),
      kind: 'knock',
      payload: { to: fig.id },
    });
    expect(knock).toMatchObject({ result: 'rejected', reason: 'unavailable' });
    const hug = await stub.command(fig.id, { opId: op(3), kind: 'hug', payload: { to: pip.id } });
    expect(hug).toMatchObject({ result: 'rejected', reason: 'unavailable' });
    const toKit = await stub.command(fig.id, { opId: op(4), kind: 'hug', payload: { to: kit.id } });
    expect(toKit).toMatchObject({ result: 'ack' });
    const words = await stub.command(fig.id, {
      opId: op(5),
      kind: 'message',
      payload: { text: 'still here' },
    });
    expect(words).toMatchObject({ result: 'ack' });

    // Unblocked, a new firefly goes; the old op id keeps its first answer.
    await api(pip, 'DELETE', `/v1/blocks/${fig.id}`);
    const again = await stub.command(fig.id, {
      opId: op(1),
      kind: 'firefly',
      payload: { action: 'left', to: pip.id },
    });
    expect(again).toMatchObject({ result: 'rejected', reason: 'unavailable' });
    const fresh = await stub.command(fig.id, {
      opId: op(6),
      kind: 'firefly',
      payload: { action: 'left', to: pip.id },
    });
    expect(fresh).toMatchObject({ result: 'ack' });
  });
});

describe('media keys a write may name', () => {
  it('takes only the farm’s own media, or media forwarded from a farm the writer lives on', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const home = await plantFarm(pip, [fig]);
    const mine = await plantFarm(pip);
    const theirs = await plantFarm(fig);

    const own = await home.stub.command(pip.id, {
      opId: op(1),
      kind: 'media',
      payload: { items: [photo(home.farm, 1)] },
    });
    expect(own).toMatchObject({ result: 'ack' });
    const stolen = await home.stub.command(pip.id, {
      opId: op(2),
      kind: 'media',
      payload: { items: [photo(theirs.farm, 2)] },
    });
    expect(stolen).toMatchObject({ result: 'rejected', reason: 'not_allowed' });
    const voice = await home.stub.command(pip.id, {
      opId: op(3),
      kind: 'voice',
      payload: {
        audio: { ...photo(theirs.farm, 3), mime: 'audio/aac' },
        durationMs: 1,
        waveform: [],
      },
    });
    expect(voice).toMatchObject({ result: 'rejected', reason: 'not_allowed' });

    const forwarded = await home.stub.command(pip.id, {
      opId: op(4),
      kind: 'media',
      payload: { items: [photo(mine.farm, 4)], forwardedFrom: { farm: mine.farm, seq: 3 } },
    });
    expect(forwarded).toMatchObject({ result: 'ack' });
    const notTheirs = await home.stub.command(pip.id, {
      opId: op(5),
      kind: 'media',
      payload: { items: [photo(theirs.farm, 5)], forwardedFrom: { farm: theirs.farm, seq: 3 } },
    });
    expect(notTheirs).toMatchObject({ result: 'rejected', reason: 'not_allowed' });
    const mismatched = await home.stub.command(pip.id, {
      opId: op(6),
      kind: 'media',
      payload: { items: [photo(theirs.farm, 6)], forwardedFrom: { farm: mine.farm, seq: 3 } },
    });
    expect(mismatched).toMatchObject({ result: 'rejected', reason: 'not_allowed' });
  });
});
