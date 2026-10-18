import { GateList } from '@kithfield/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { op } from '../farm/support/client';
import {
  api,
  cast,
  farmStub,
  freshFarmId,
  plantFarm,
  profile,
  useTestPorts,
} from '../farm/support/doubles';

beforeEach(() => {
  useTestPorts();
});

const gatesOf = async (person: Parameters<typeof api>[0], query = '') => {
  const response = await api(person, 'GET', `/v1/gates${query}`);
  expect(response.status).toBe(200);
  return GateList.parse(response.body).gates;
};

/** Pip and Fig live on Home; Kit, Fig and Bea live on Next Door; Bea lives on Home too. */
const neighbours = async () => {
  const people = await cast('pip', 'fig', 'kit', 'bea', 'mo');
  const { pip, fig, kit, bea } = people;
  const home = await plantFarm(pip, [fig, bea], { name: 'Home' });
  const next = await plantFarm(kit, [fig, bea], { name: 'Next Door' });
  return { ...people, home, next };
};

describe('the gates a person may visit', () => {
  it('are the farms where their friends live, with the friends they know there', async () => {
    const { pip, fig, kit, bea, mo, home, next } = await neighbours();
    const kits = await gatesOf(kit);
    expect(kits).toHaveLength(1);
    expect(kits[0]).toMatchObject({
      farm: home.farm,
      name: 'Home',
      land: 'meadow',
      signature: expect.any(String) as unknown,
    });
    expect(kits[0]?.season.season).toBe('autumn');
    expect(new Set(kits[0]?.friends)).toEqual(new Set([fig.id, bea.id]));
    expect((await gatesOf(pip)).map((g) => g.farm)).toEqual([next.farm]);
    // Someone living on both farms has no gate to visit, and a stranger none at all.
    expect(await gatesOf(fig)).toEqual([]);
    expect(await gatesOf(mo)).toEqual([]);
  });

  it("narrow to one friend's farms", async () => {
    const { kit, fig, mo, home } = await neighbours();
    const third = await plantFarm(mo, [fig], { name: 'Allotment' });
    const all = await gatesOf(kit);
    expect(all.map((g) => g.name)).toEqual(['Allotment', 'Home']);
    expect(all.find((g) => g.farm === third.farm)?.friends).toEqual([fig.id]);
    const figs = await gatesOf(kit, `?person=${fig.id}`);
    expect(figs.map((g) => g.farm).sort()).toEqual([third.farm, home.farm].sort());
    expect(figs.every((g) => g.friends.length === 1 && g.friends[0] === fig.id)).toBe(true);
    expect(await gatesOf(kit, `?person=${mo.id}`)).toEqual([]);
    expect((await api(kit, 'GET', '/v1/gates?person=')).status).toBe(400);
  });

  it('leave out a friend blocked either way, and a farm with no friend left', async () => {
    const { kit, fig, bea, home } = await neighbours();
    expect((await api(fig, 'PUT', `/v1/blocks/${kit.id}`)).status).toBe(204);
    expect((await gatesOf(kit))[0]?.friends).toEqual([bea.id]);
    expect((await api(kit, 'PUT', `/v1/blocks/${bea.id}`)).status).toBe(204);
    expect(await gatesOf(kit)).toEqual([]);
    expect((await api(fig, 'DELETE', `/v1/blocks/${kit.id}`)).status).toBe(204);
    expect((await gatesOf(kit)).map((g) => [g.farm, g.friends])).toEqual([[home.farm, [fig.id]]]);
  });

  it('never list a farm that removed the person', async () => {
    const { pip, kit, home } = await neighbours();
    await home.stub.join(kit.id, profile(kit), true);
    expect(await gatesOf(kit)).toEqual([]);
    await home.stub.command(pip.id, {
      opId: op(1),
      kind: 'removed',
      payload: { person: kit.id, removeMedia: false },
    });
    expect(await gatesOf(kit)).toEqual([]);
    expect((await api(kit, 'GET', `/v1/farms/${home.farm}/gate`)).status).toBe(404);
  });

  it('count friends made on farms, never on visits', async () => {
    const { fig, mo, home } = await neighbours();
    const porch = freshFarmId();
    await farmStub(porch).create({
      farm: porch,
      kind: 'visit',
      name: null,
      land: 'porch',
      timeZone: 'UTC',
      hemisphere: 'north',
      keeper: null,
      pair: [fig.id, mo.id].sort().join(':'),
      members: [
        { person: fig.id, profile: profile(fig), via: 'visit' },
        { person: mo.id, profile: profile(mo), via: 'visit' },
      ],
    });
    expect((await gatesOf(mo)).map((g) => g.farm)).not.toContain(home.farm);
    expect((await gatesOf(fig)).map((g) => g.farm)).not.toContain(porch);
  });

  it('are for signed-in people only', async () => {
    expect((await api(null, 'GET', '/v1/gates')).status).toBe(401);
  });
});
