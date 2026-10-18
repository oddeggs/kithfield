import { describe, expect, it } from '@jest/globals';
import type { Species } from '@kithfield/contracts';

import {
  bubbleSize,
  headOf,
  layoutBubbles,
  type BubbleWish,
  type PlacedBubble,
} from './bubble-layout';
import { placeFarm, sceneHeight } from './scene-layout';

const W = 393;
const H = sceneHeight(W);
const CEILING = 110;

const overlap = (a: PlacedBubble, b: PlacedBubble) =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

/** The farm's critters with a status each, laid out as the farm home lays them out. */
function farmWithStatuses(species: readonly Species[], texts: readonly string[]) {
  const placement = placeFarm(
    species.map((s, i) => ({ person: `p${i}`, species: s, joinedAt: i })),
  );
  const wishes: BubbleWish[] = placement.critters.flatMap((c) => {
    const i = Number(c.person.slice(1));
    const text = texts[i % texts.length];
    if (!text) return [];
    return [{ key: c.person, text, ...headOf(c.spot, W, H), maxWidth: 150, meta: i === 0 }];
  });
  return { placement, placed: layoutBubbles(wishes, W, CEILING) };
}

function expectClear({ placement, placed }: ReturnType<typeof farmWithStatuses>) {
  for (const b of placed) {
    expect(b.left).toBeGreaterThanOrEqual(10);
    expect(b.left + b.width).toBeLessThanOrEqual(W - 10);
    expect(b.top).toBeGreaterThanOrEqual(CEILING);
    // Never over its own critter: the bubble ends where the critter's drawing starts.
    const c = placement.critters.find((x) => x.person === b.key);
    if (!c) throw new Error('a bubble for nobody');
    // The critter's drawing: the art's sprite box is 1.55 sizes tall, its feet 0.08 above the
    // bottom, and it is 1.3 sizes wide.
    const size = W * c.spot.size;
    const x = W * c.spot.x;
    const top = H * c.spot.y - size * 1.47;
    const covers =
      b.top + b.height > top && b.left < x + size * 0.65 && b.left + b.width > x - size * 0.65;
    expect(covers).toBe(false);
    for (const o of placed) if (o !== b) expect(overlap(o, b)).toBe(false);
  }
}

describe('laying out bubbles over the farm', () => {
  it('wraps long words onto more lines within the bubble’s width', () => {
    expect(bubbleSize('picnic?', 150, false).height).toBeLessThan(
      bubbleSize('night shift. soup thoughts and more soup', 150, false).height,
    );
    expect(bubbleSize('a very long status that wraps', 150, false).width).toBeLessThanOrEqual(150);
  });

  it('keeps the statuses of the farm’s own five clear of each other and of their critters', () => {
    expectClear(
      farmWithStatuses(
        ['rabbit', 'sheep', 'hedgehog', 'frog', 'mole'],
        [
          'making soup, come by after 6',
          'day 3 at the new job!',
          '',
          'anyone want courgettes?',
          'night shift. soup thoughts',
        ],
      ),
    );
  });

  it('keeps 24 critters’ statuses clear, dropping what has no room rather than stacking it', () => {
    const species: Species[] = ['fox', 'bear', 'duck', 'tortoise', 'cat', 'badger', 'mouse', 'owl'];
    const farm = farmWithStatuses(
      Array.from({ length: 24 }, (_, i) => species[i % species.length] ?? 'fox'),
      ['off to the coast', 'need a walk buddy', 'sleepy day', 'night shift. soup thoughts'],
    );
    expectClear(farm);
    expect(farm.placed.length).toBeGreaterThan(4);
    expect(farm.placed.length).toBeLessThan(24);
  });

  it('lifts a bubble at most one bubble’s height, and tries both sides first', () => {
    const wish = (key: string, x: number, order = 0): BubbleWish => ({
      key,
      text: 'anyone want courgettes?',
      x,
      y: 300,
      maxWidth: 150,
      meta: false,
      order,
    });
    const [a, b] = layoutBubbles([wish('a', 150), wish('b', 220, 1)], W, CEILING);
    expect(a?.top).toBe(300 - (a?.height ?? 0));
    expect(b?.top).toBe(a?.top);
    expect(b?.tail).not.toBe(a?.tail);
    const crowd = layoutBubbles(
      [wish('a', 150), wish('b', 160, 1), wish('c', 170, 2), wish('d', 180, 3), wish('e', 175, 4)],
      W,
      CEILING,
    );
    for (const p of crowd) expect(p.top).toBeGreaterThanOrEqual(300 - 2 * p.height - 8);
    expect(crowd.map((p) => p.key)).not.toContain('e');
  });
});
