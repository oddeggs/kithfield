import { describe, expect, it } from '@jest/globals';
import type { BlockList } from '@kithfield/contracts';

import { connectBlocks, createBlocks, type BlocksPort } from './blocks';

const bram = { person: 'bram', name: 'Bram', critter: null, at: 1 };

function server(start: BlockList['blocked'], fail = false) {
  const calls: string[] = [];
  let resolveWrite: (() => void) | null = null;
  const port: BlocksPort = {
    list: () => Promise.resolve({ blocked: start }),
    block: (person) => {
      calls.push(`block ${person}`);
      return new Promise((resolve, reject) => {
        resolveWrite = () => (fail ? reject(new Error('unavailable')) : resolve());
      });
    },
    unblock: (person) => {
      calls.push(`unblock ${person}`);
      return new Promise((resolve, reject) => {
        resolveWrite = () => (fail ? reject(new Error('unavailable')) : resolve());
      });
    },
  };
  return { port, calls, answer: () => resolveWrite?.() };
}

describe('the people this person blocked', () => {
  it('reads the list from the server', async () => {
    const blocks = createBlocks(server([bram]).port);
    expect(blocks.isBlocked('bram')).toBe(false);
    await blocks.refresh();
    expect(blocks.isBlocked('bram')).toBe(true);
    expect(blocks.getState().blocked).toEqual([bram]);
  });

  it('blocks at once, before the server answers', async () => {
    const s = server([]);
    const blocks = createBlocks(s.port, () => 5);
    let changes = 0;
    blocks.subscribe(() => (changes += 1));
    const done = blocks.block({ person: 'bram', name: 'Bram', critter: null });
    expect(blocks.isBlocked('bram')).toBe(true);
    expect(blocks.getState().blocked).toEqual([{ ...bram, at: 5 }]);
    s.answer();
    await done;
    expect(blocks.isBlocked('bram')).toBe(true);
    expect(changes).toBeGreaterThan(0);
    expect(s.calls).toEqual(['block bram']);
  });

  it('takes a block back when the server refuses it', async () => {
    const s = server([], true);
    const blocks = createBlocks(s.port);
    const done = blocks.block({ person: 'bram', name: 'Bram', critter: null });
    expect(blocks.isBlocked('bram')).toBe(true);
    s.answer();
    await expect(done).rejects.toThrow('unavailable');
    expect(blocks.isBlocked('bram')).toBe(false);
  });

  it('unblocks at once, and puts the block back when the server refuses', async () => {
    const s = server([bram], true);
    const blocks = createBlocks(s.port);
    await blocks.refresh();
    const done = blocks.unblock('bram');
    expect(blocks.isBlocked('bram')).toBe(false);
    s.answer();
    await expect(done).rejects.toThrow('unavailable');
    expect(blocks.getState().blocked).toEqual([bram]);
  });
});

describe('the one block list across sessions', () => {
  it('reads through the session that connected last and forgets the one before', async () => {
    const first = connectBlocks(server([bram]).port);
    await first.refresh();
    expect(first.isBlocked('bram')).toBe(true);
    first.clear();
    expect(first.isBlocked('bram')).toBe(false);
    const next = connectBlocks(server([{ ...bram, person: 'fig', name: 'Fig' }]).port);
    expect(next).toBe(first);
    await next.refresh();
    expect(next.isBlocked('fig')).toBe(true);
    expect(next.isBlocked('bram')).toBe(false);
  });
});
