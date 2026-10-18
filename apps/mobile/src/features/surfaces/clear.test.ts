import { describe, expect, it } from '@jest/globals';

import { clearSurfaces, writtenForSomeoneElse } from './clear';
import { memoryGroup } from './memory-group.test-data';

describe('signing out of the surfaces', () => {
  it('deletes what the surfaces hold, ends every activity and reloads the widgets', async () => {
    const group = memoryGroup({
      'surfaces/data.json': '{}',
      'surfaces/images/farm-a-day.png': 'png',
      'surfaces/share-outbox/x.json': '{}',
      'surfaces/person.json': '{}',
      'other/kept.txt': 'kept',
    });
    const ended: string[] = [];
    let reloaded = 0;
    await clearSurfaces({
      group,
      activities: {
        list: () => Promise.resolve([{ id: 'a' }, { id: 'b' }]),
        end: (id) => {
          ended.push(id);
          return Promise.resolve();
        },
      },
      reload: () => {
        reloaded += 1;
      },
    });
    expect([...group.files.keys()]).toEqual(['other/kept.txt']);
    expect(ended).toEqual(['a', 'b']);
    expect(reloaded).toBe(1);
  });

  it('still reloads the widgets when ending an activity fails', async () => {
    const group = memoryGroup({ 'surfaces/data.json': '{}' });
    let reloaded = 0;
    await clearSurfaces({
      group,
      activities: { list: () => Promise.reject(new Error('gone')), end: () => Promise.resolve() },
      reload: () => {
        reloaded += 1;
      },
    });
    expect(group.files.size).toBe(0);
    expect(reloaded).toBe(1);
  });
});

describe('another person on this phone', () => {
  it('finds surfaces written for someone else, and none for the same person or a new install', async () => {
    expect(
      await writtenForSomeoneElse(
        memoryGroup({ 'surfaces/person.json': '{"person":"p_a"}' }),
        'p_b',
      ),
    ).toBe(true);
    expect(
      await writtenForSomeoneElse(
        memoryGroup({ 'surfaces/person.json': '{"person":"p_b"}' }),
        'p_b',
      ),
    ).toBe(false);
    expect(await writtenForSomeoneElse(memoryGroup({}), 'p_b')).toBe(false);
    expect(
      await writtenForSomeoneElse(memoryGroup({ 'surfaces/person.json': 'junk' }), 'p_b'),
    ).toBe(true);
  });
});
