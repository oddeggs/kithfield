import { isTombstone, parseEvent, ScrapbookList } from '@kithfield/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { op } from '../farm/support/client';
import { api, cast, type Person, plantFarm, useTestPorts } from '../farm/support/doubles';

beforeEach(() => {
  useTestPorts();
});

let run = 0;

/** Sends a command over HTTP and returns its seq. */
const send = async (person: Person, farm: string, kind: string, payload: unknown) => {
  run++;
  const written = await api(person, 'POST', `/v1/farms/${farm}/cmd`, {
    opId: op(run, 7),
    kind,
    payload,
  });
  expect(written.body).toMatchObject({ result: 'ack' });
  return (written.body as { seq: number }).seq;
};

const scrapbook = async (person: Person, farm: string, query = '') => {
  const response = await api(person, 'GET', `/v1/farms/${farm}/scrapbook${query}`);
  expect(response.status).toBe(200);
  return ScrapbookList.parse(response.body);
};

describe('the scrapbook', () => {
  it('shows pressed pages newest first, with what each keeps', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const hello = await send(pip, farm, 'message', { text: 'picnic by the river' });
    const later = await send(fig, farm, 'message', { text: 'the swans!' });
    const first = await send(pip, farm, 'scrapbook_page', {
      action: 'pressed',
      title: 'Picnic',
      items: [hello, later],
      flower: 'marigold',
    });
    const second = await send(fig, farm, 'scrapbook_page', {
      action: 'pressed',
      title: 'Swans',
      items: [later],
    });
    const book = await scrapbook(fig, farm);
    expect(book.more).toBe(false);
    expect(book.pages.map((p) => [p.seq, p.title, p.actor])).toEqual([
      [second, 'Swans', fig.id],
      [first, 'Picnic', pip.id],
    ]);
    expect(book.pages[1]).toMatchObject({ seed: null, flower: 'marigold' });
    expect(book.pages[0]).toMatchObject({ seed: null, flower: null });
    expect(book.pages[1]?.items.map((e) => e.seq)).toEqual([hello, later]);
    const item = parseEvent(book.pages[1]!.items[0]);
    expect(item.status).toBe('known');
  });

  it('leaves out pages a member hid or unsent, and keeps unsent items as gaps', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const words = await send(pip, farm, 'message', { text: 'by the fire' });
    const kept = await send(pip, farm, 'scrapbook_page', {
      action: 'pressed',
      title: 'Fireside',
      items: [words],
    });
    const hidden = await send(pip, farm, 'scrapbook_page', {
      action: 'pressed',
      title: 'Hidden',
      items: [],
    });
    const unsent = await send(fig, farm, 'scrapbook_page', {
      action: 'pressed',
      title: 'Oops',
      items: [],
    });
    await send(fig, farm, 'scrapbook_page', { action: 'hidden', target: hidden });
    await send(fig, farm, 'unsend', { target: unsent });
    await send(pip, farm, 'unsend', { target: words });
    const book = await scrapbook(pip, farm);
    expect(book.pages.map((p) => p.seq)).toEqual([kept]);
    const [gap] = book.pages[0]!.items;
    expect(gap?.seq).toBe(words);
    expect(isTombstone(gap?.payload)).toBe(true);
  });

  it('pages back with before, twenty pages at a time', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const seqs: number[] = [];
    for (let i = 0; i < 23; i++) {
      seqs.push(
        await send(pip, farm, 'scrapbook_page', {
          action: 'pressed',
          title: `Page ${i}`,
          items: [],
        }),
      );
    }
    const newest = await scrapbook(pip, farm);
    expect(newest.pages).toHaveLength(20);
    expect(newest.more).toBe(true);
    expect(newest.pages[0]?.seq).toBe(seqs[22]);
    const oldest = await scrapbook(pip, farm, `?before=${newest.pages.at(-1)!.seq}`);
    expect(oldest.pages.map((p) => p.seq)).toEqual([seqs[2], seqs[1], seqs[0]]);
    expect(oldest.more).toBe(false);
    expect((await api(pip, 'GET', `/v1/farms/${farm}/scrapbook?before=0`)).status).toBe(400);
  });

  it('is for members only', async () => {
    const { pip, kit } = await cast('pip', 'kit');
    const { farm } = await plantFarm(pip);
    expect((await api(kit, 'GET', `/v1/farms/${farm}/scrapbook`)).status).toBe(404);
    expect((await api(null, 'GET', `/v1/farms/${farm}/scrapbook`)).status).toBe(401);
  });
});
