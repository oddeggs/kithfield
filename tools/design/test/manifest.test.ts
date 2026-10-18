import { describe, expect, it } from 'vitest';

import { diffHashes, treeDigest } from '../src/hashes';
import { type RenderEntry, buildIndex, mergeIndex } from '../src/manifest';
import { scrollStops } from '../src/stops';

function entry(id: string, source = '04 Farm and Chat.dc.html'): RenderEntry {
  return {
    id,
    kind: 'screen',
    file: `${id}.png`,
    source,
    title: 'A screen',
    width: 393,
    height: 852,
    scale: 3,
    variants: { winter: `${id}.winter.png`, night: `${id}.night.png` },
  };
}

describe('the index', () => {
  it('keys entries by id in sorted order with sorted variants', () => {
    const index = buildIndex([entry('04-03'), entry('04-01')]);
    expect(Object.keys(index.renders)).toEqual(['04-01', '04-03']);
    expect(Object.keys(index.renders['04-01']?.variants ?? {})).toEqual(['night', 'winter']);
    expect(index.renders['04-01']?.source).toBe('04 Farm and Chat.dc.html');
  });

  it('refuses an id that appears twice', () => {
    expect(() => buildIndex([entry('04-01'), entry('04-01', '12 States.dc.html')])).toThrow(/04-01/);
  });

  it('merges a partial run into the previous index', () => {
    const previous = buildIndex([entry('04-01'), entry('16-12')]);
    const next = buildIndex([{ ...entry('04-01'), title: 'Renamed' }]);
    const merged = mergeIndex(previous, next);
    expect(Object.keys(merged.renders)).toEqual(['04-01', '16-12']);
    expect(merged.renders['04-01']?.title).toBe('Renamed');
  });
});

describe('scroll stops', () => {
  it('stops once per short section and once per viewport through a tall one', () => {
    const stops = scrollStops(
      [
        { label: 'top', top: 0, height: 0 },
        { label: 'evening', top: 0, height: 2500 },
        { label: 'critters', top: 2500, height: 700 },
        { label: 'join', top: 3200, height: 400 },
      ],
      1000,
      3600,
    );
    expect(stops).toEqual([
      { name: 'evening-01', y: 0 },
      { name: 'evening-02', y: 1000 },
      { name: 'evening-03', y: 2000 },
      { name: 'critters', y: 2500 },
      { name: 'join', y: 2600 },
    ]);
  });
});

describe('determinism hashes', () => {
  it('reports changed and one-sided files', () => {
    const a = new Map([
      ['04-01.png', 'aa'],
      ['04-02.png', 'bb'],
      ['04-03.png', 'cc'],
    ]);
    const b = new Map([
      ['04-01.png', 'aa'],
      ['04-02.png', 'xx'],
      ['04-04.png', 'dd'],
    ]);
    expect(diffHashes(a, b)).toEqual({
      same: 1,
      changed: ['04-02.png'],
      onlyInFirst: ['04-03.png'],
      onlyInSecond: ['04-04.png'],
    });
  });

  it('digests a tree independently of insertion order', () => {
    const a = new Map([
      ['x.png', '1'],
      ['y.png', '2'],
    ]);
    const b = new Map([
      ['y.png', '2'],
      ['x.png', '1'],
    ]);
    expect(treeDigest(a)).toBe(treeDigest(b));
  });
});
