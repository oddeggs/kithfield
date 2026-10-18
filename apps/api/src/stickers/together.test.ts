import {
  ErrorBody,
  TogetherAskList,
  TogetherExportConsents,
  TogetherPeople,
} from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nextOp, plantThrough } from '../../test/admin/support';
import { ledgerOf, MIDDAY, useTestClock } from '../../test/cottage-doubles';
import { api, cast, type Person, useTestPorts } from '../../test/farm/support/doubles';
import { type AccountDeletedJob, purgeAccount } from '../auth/purge';
import { mergeStepStatements } from '../auth/merge-steps';

beforeEach(() => {
  useTestPorts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DAY = 24 * 60 * 60_000;

const together = async (who: Person, farm: string) => {
  const res = await api(who, 'GET', `/v1/farms/${farm}/together`);
  expect(res.status).toBe(200);
  return TogetherPeople.parse(res.body).people;
};

const exportAsk = async (who: Person, farm: string, people: Person[]) => {
  const res = await api(who, 'POST', '/v1/stickers/together/export', {
    farm,
    people: people.map((p) => p.id),
  });
  expect(res.status).toBe(200);
  return TogetherExportConsents.parse(res.body).ok;
};

const asks = async (who: Person) => {
  const res = await api(who, 'GET', '/v1/stickers/together/asks');
  expect(res.status).toBe(200);
  return TogetherAskList.parse(res.body).asks;
};

const answer = (who: Person, from: Person, ok: boolean) =>
  api(who, 'PUT', `/v1/stickers/together/asks/${from.id}`, { ok });

const lot = async () => {
  const people = await cast('june', 'pip', 'fig', 'bea');
  const farm = await plantThrough(people.june, [people.pip, people.fig, people.bea]);
  return { ...people, farm };
};

describe('who can be drawn into a together sticker', () => {
  it('lists the other members', async () => {
    const { june, pip, fig, bea, farm } = await lot();
    // The test clock is still, so everyone joined at the same moment: compare as sets.
    const ids = (people: Person[]) => people.map((p) => p.id).sort();
    expect((await together(june, farm)).sort()).toEqual(ids([pip, fig, bea]));
    expect((await together(pip, farm)).sort()).toEqual(ids([june, fig, bea]));
  });

  it('leaves out who turned it off, who left, a block either way and deleted accounts', async () => {
    const { june, pip, fig, bea, farm } = await lot();
    const kit = (await cast('kit')).kit;
    const second = await plantThrough(june, [kit]);
    expect(second).not.toBe(farm);
    expect(await together(june, second)).toEqual([kit.id]);

    const off = await api(pip, 'PATCH', '/v1/me/settings', { inTogetherStickers: false });
    expect(off.status).toBe(200);
    await api(fig, 'PUT', `/v1/blocks/${june.id}`);
    await env.DB.prepare('UPDATE memberships SET left_at = ? WHERE farm_id = ? AND person_id = ?')
      .bind(Date.now(), farm, bea.id)
      .run();
    expect(await together(june, farm)).toEqual([]);
    // The block works both ways; Pip's choice holds for everyone.
    expect(await together(fig, farm)).toEqual([]);

    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
      .bind(Date.now(), kit.id)
      .run();
    expect(await together(june, second)).toEqual([]);
  });

  it('answers 404 to someone who doesn’t live on the farm, and 401 without a session', async () => {
    const { farm } = await lot();
    const { kit } = await cast('kit');
    expect((await api(kit, 'GET', `/v1/farms/${farm}/together`)).status).toBe(404);
    expect((await api(null, 'GET', `/v1/farms/${farm}/together`)).status).toBe(401);
  });
});

describe('taking a together sticker out of Kithfield', () => {
  it('asks each friend once, and tells the asker only who said yes', async () => {
    const { june, pip, fig, farm } = await lot();
    expect(await exportAsk(june, farm, [pip, fig])).toEqual([]);

    const [ask] = await asks(pip);
    expect(ask).toMatchObject({ from: june.id, farm, ok: null });
    expect((await answer(pip, june, true)).status).toBe(204);
    expect((await answer(fig, june, false)).status).toBe(204);

    // A no reads exactly like no answer yet.
    expect(await exportAsk(june, farm, [pip, fig])).toEqual([pip.id]);
    expect(await exportAsk(june, farm, [fig])).toEqual([]);

    // Asking again never resets an answer or makes a second ask.
    expect(await asks(pip)).toEqual([{ ...ask, ok: true }]);
    expect((await asks(fig)).map((a) => a.ok)).toEqual([false]);
    expect(await asks(june)).toEqual([]);
  });

  it('tells each friend by push the first time they are asked, and never again', async () => {
    useTestClock(MIDDAY);
    const { june, pip, fig, farm } = await lot();
    await exportAsk(june, farm, [pip]);
    await exportAsk(june, farm, [pip, fig]);
    const asked = async (who: Person) =>
      (await ledgerOf(who.id)).filter((r) => r['kind'] === 'together_ask');
    // Everyone moving in spent the farm's pushes for today: the ask folds into "a few things".
    expect(await asked(pip)).toEqual([
      expect.objectContaining({ farm, seq: null, decision: 'collapsed', reason: 'budget' }),
    ]);
    expect(await asked(fig)).toHaveLength(1);
    expect(await asked(june)).toEqual([]);
  });

  it('lets a friend change their answer', async () => {
    const { june, pip, farm } = await lot();
    await exportAsk(june, farm, [pip]);
    await answer(pip, june, false);
    expect(await exportAsk(june, farm, [pip])).toEqual([]);
    expect((await answer(pip, june, true)).status).toBe(204);
    expect(await exportAsk(june, farm, [pip])).toEqual([pip.id]);
    expect((await answer(pip, june, false)).status).toBe(204);
    expect(await exportAsk(june, farm, [pip])).toEqual([]);
  });

  it('keeps each asker’s yes their own', async () => {
    const { june, pip, fig, farm } = await lot();
    await exportAsk(june, farm, [fig]);
    await exportAsk(pip, farm, [fig]);
    await answer(fig, pip, true);
    expect(await exportAsk(pip, farm, [fig])).toEqual([fig.id]);
    expect(await exportAsk(june, farm, [fig])).toEqual([]);
    expect((await asks(fig)).map((a) => a.from).sort()).toEqual([june.id, pip.id].sort());
  });

  it('turns down people who can’t be drawn, the asker themselves and outsiders', async () => {
    const { june, pip, fig, farm } = await lot();
    const { kit } = await cast('kit');
    await api(pip, 'PATCH', '/v1/me/settings', { inTogetherStickers: false });
    const turnedOff = await api(june, 'POST', '/v1/stickers/together/export', {
      farm,
      people: [pip.id],
    });
    expect(turnedOff.status).toBe(404);
    const stranger = await api(june, 'POST', '/v1/stickers/together/export', {
      farm,
      people: [kit.id],
    });
    expect(stranger.status).toBe(404);
    const self = await api(june, 'POST', '/v1/stickers/together/export', {
      farm,
      people: [june.id, fig.id],
    });
    expect(self.status).toBe(400);
    expect(ErrorBody.parse(self.body).error.code).toBe('bad_request');
    const outsider = await api(kit, 'POST', '/v1/stickers/together/export', {
      farm,
      people: [fig.id],
    });
    expect(outsider.status).toBe(404);
    const empty = await api(june, 'POST', '/v1/stickers/together/export', { farm, people: [] });
    expect(empty.status).toBe(400);
    // Nothing was asked along the way.
    expect(await asks(fig)).toEqual([]);
    expect(await asks(kit)).toEqual([]);
  });

  it('answers 404 for an answer to someone who never asked', async () => {
    const { june, pip } = await lot();
    const res = await answer(pip, june, true);
    expect(res.status).toBe(404);
    expect(ErrorBody.parse(res.body).error.code).toBe('not_found');
    expect((await api(pip, 'PUT', `/v1/stickers/together/asks/${june.id}`, {})).status).toBe(400);
  });

  it('hides asks from someone blocked either way, or whose account was deleted', async () => {
    const { june, pip, fig, bea, farm } = await lot();
    await exportAsk(june, farm, [pip]);
    await exportAsk(fig, farm, [pip]);
    await exportAsk(bea, farm, [pip]);
    await api(pip, 'PUT', `/v1/blocks/${june.id}`);
    await api(fig, 'PUT', `/v1/blocks/${pip.id}`);
    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
      .bind(Date.now(), bea.id)
      .run();
    expect(await asks(pip)).toEqual([]);
  });
});

describe('together sticker asks and accounts', () => {
  it('go with a deleted account, both those it made and those made of it', async () => {
    const { june, pip, fig, farm } = await lot();
    await exportAsk(june, farm, [pip]);
    await exportAsk(fig, farm, [june]);
    await exportAsk(fig, farm, [pip]);
    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
      .bind(Date.now() - 31 * DAY, june.id)
      .run();
    await purgeAccount(env, {
      kind: 'account_deleted',
      person: june.id,
      at: 0,
    } satisfies AccountDeletedJob);
    const { results } = await env.DB.prepare(
      'SELECT subject_id, asker_id FROM together_consents WHERE subject_id = ?1 OR asker_id = ?1',
    )
      .bind(june.id)
      .all();
    expect(results).toEqual([]);
    expect((await asks(pip)).map((a) => a.from)).toEqual([fig.id]);
  });

  it('move to the returning person when an anonymous one merges in', async () => {
    const { june, pip, fig, farm } = await lot();
    await exportAsk(june, farm, [pip]);
    await exportAsk(pip, farm, [fig]);
    await answer(pip, june, true);
    await env.DB.batch(
      mergeStepStatements(env.DB, { from: pip.id, into: fig.id, now: Date.now() }),
    );
    const { results } = await env.DB.prepare(
      'SELECT subject_id, asker_id, ok FROM together_consents ORDER BY subject_id, asker_id',
    ).all<{ subject_id: string; asker_id: string; ok: number | null }>();
    const mine = results.filter((r) => [june.id, pip.id, fig.id].includes(r.subject_id));
    // Pip's yes to June is Fig's now; Pip's ask of Fig would be Fig asking themselves, so it goes.
    expect(mine).toEqual([{ subject_id: fig.id, asker_id: june.id, ok: 1 }]);
  });
});

describe('a together sticker on the farm', () => {
  const sticker = (who: Person, farm: string, people: Person[]) =>
    api(who, 'POST', `/v1/farms/${farm}/cmd`, {
      opId: nextOp(),
      kind: 'sticker',
      payload: { pack: 'mine', sticker: 'us', with: people.map((p) => p.id) },
    });
  const reason = (res: { body: unknown }) => res.body as { result: string; reason?: string };

  it('draws friends who can be drawn', async () => {
    const { june, pip, fig, farm } = await lot();
    expect(reason(await sticker(june, farm, [pip, fig])).result).toBe('ack');
  });

  it('is refused when anyone in it blocked the sender or was blocked by them', async () => {
    const { june, pip, fig, farm } = await lot();
    await api(pip, 'PUT', `/v1/blocks/${june.id}`);
    expect(reason(await sticker(june, farm, [fig, pip]))).toMatchObject({
      result: 'rejected',
      reason: 'not_allowed',
    });
    await api(pip, 'DELETE', `/v1/blocks/${june.id}`);
    await api(june, 'PUT', `/v1/blocks/${fig.id}`);
    expect(reason(await sticker(june, farm, [fig]))).toMatchObject({ reason: 'not_allowed' });
  });

  it('is refused when anyone in it turned together stickers off', async () => {
    const { june, pip, bea, farm } = await lot();
    await api(bea, 'PATCH', '/v1/me/settings', { inTogetherStickers: false });
    expect(reason(await sticker(june, farm, [pip, bea]))).toMatchObject({
      result: 'rejected',
      reason: 'not_allowed',
    });
  });
});
