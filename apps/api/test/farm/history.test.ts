import { EventsPage, SearchResults } from '@kithfield/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { op } from './support/client';
import { api, cast, type Person, plantFarm, useTestPorts } from './support/doubles';

beforeEach(() => {
  useTestPorts();
});

let viewer: Person;

const get = (path: string, person: Person = viewer) => api(person, 'GET', `/v1${path}`);

/** A farm (seq 1–3) with ten messages from Pip and Fig (seq 4–13) and a link at seq 14. */
const talkative = async () => {
  const { pip, fig } = await cast('pip', 'fig');
  viewer = pip;
  const planted = await plantFarm(pip, [fig]);
  for (let n = 1; n <= 10; n++) {
    await planted.stub.command(n % 2 === 0 ? fig.id : pip.id, {
      opId: op(n),
      kind: 'message',
      payload: { text: `note ${n}` },
    });
  }
  await planted.stub.command(fig.id, {
    opId: op(11),
    kind: 'link',
    payload: { url: 'https://example.com/garden', text: 'Rhubarb tips' },
  });
  return { ...planted, pip, fig };
};

/** A farm with only Pip. */
const alone = async () => {
  const { pip } = await cast('pip');
  viewer = pip;
  return { ...(await plantFarm(pip)), pip };
};

describe('GET /v1/farms/:id/events', () => {
  it('pages after a seq, before one, and the newest page, oldest first', async () => {
    const { farm } = await talkative();
    const seqs = async (query: string) => {
      const page = EventsPage.parse((await get(`/farms/${farm}/events?${query}`)).body);
      return [page.events.map((e) => e.seq), page.more];
    };
    expect(await seqs('after=3&limit=4')).toEqual([[4, 5, 6, 7], true]);
    expect(await seqs('after=10&limit=10')).toEqual([[11, 12, 13, 14], false]);
    expect(await seqs('before=6&limit=3')).toEqual([[3, 4, 5], true]);
    expect(await seqs('before=3&limit=5')).toEqual([[1, 2], false]);
    expect(await seqs('limit=2')).toEqual([[13, 14], true]);
    expect(await seqs('after=5&before=9&limit=10')).toEqual([[6, 7, 8], false]);
    expect(await seqs('kinds=link,joined&limit=10')).toEqual([[2, 3, 14], false]);
  });

  it('refuses people who don’t live there and queries that don’t parse', async () => {
    const { farm } = await talkative();
    expect((await get(`/farms/${farm}/events`, (await cast('kit')).kit)).status).toBe(404);
    expect((await get(`/farms/${farm}/events?limit=500`)).status).toBe(400);
    expect((await get(`/farms/${farm}/events?after=9&before=4`)).status).toBe(400);
  });
});

describe('GET /v1/farms/:id/search', () => {
  it('finds words inside the farm, newest first, with a snippet', async () => {
    const { farm, fig } = await talkative();
    const results = SearchResults.parse((await get(`/farms/${farm}/search?q=note`)).body).results;
    expect(results.map((r) => r.seq)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
    const link = SearchResults.parse((await get(`/farms/${farm}/search?q=rhubarb`)).body).results;
    expect(link.map(({ seq, actor, kind }) => ({ seq, actor, kind }))).toEqual([
      { seq: 14, actor: fig.id, kind: 'link' },
    ]);
    expect(link[0]?.snippet).toContain('Rhubarb');
  });

  it('matches word starts, ignores Vietnamese tone marks, and survives FTS syntax in the query', async () => {
    const { farm, stub, pip } = await alone();
    await stub.command(pip.id, {
      opId: op(1),
      kind: 'message',
      payload: { text: 'Chúng ta đi chợ nhé' },
    });
    const search = async (q: string) =>
      SearchResults.parse(
        (await get(`/farms/${farm}/search?q=${encodeURIComponent(q)}`)).body,
      ).results.map((r) => r.seq);
    expect(await search('cho')).toEqual([3]);
    expect(await search('chúng ta')).toEqual([3]);
    expect(await search('"OR (*')).toEqual([]);
  });

  it('follows edits and forgets unsent words', async () => {
    const { farm, stub, pip } = await alone();
    await stub.command(pip.id, {
      opId: op(1),
      kind: 'message',
      payload: { text: 'picnic on thursday' },
    });
    await stub.command(pip.id, {
      opId: op(2),
      kind: 'edit',
      payload: { target: 3, text: 'picnic on friday' },
    });
    const search = async (q: string) =>
      SearchResults.parse((await get(`/farms/${farm}/search?q=${q}`)).body).results.map(
        (r) => r.seq,
      );
    expect(await search('thursday')).toEqual([]);
    expect(await search('friday')).toEqual([3]);
    await stub.command(pip.id, { opId: op(3), kind: 'unsend', payload: { target: 3 } });
    expect(await search('picnic')).toEqual([]);
  });
});
