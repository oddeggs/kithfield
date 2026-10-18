import { describe, expect, it } from '@jest/globals';

import { bubbleSize, layoutBubbles } from './bubble-layout';

describe('laying out bubbles over the farm', () => {
  it('wraps long words onto more lines within the bubble’s width', () => {
    expect(bubbleSize('picnic?', 150, false).height).toBeLessThan(
      bubbleSize('night shift. soup thoughts and more soup', 150, false).height,
    );
    expect(bubbleSize('a very long status that wraps', 150, false).width).toBeLessThanOrEqual(150);
  });

  it('keeps bubbles on the farm and lifts any that would cover another', () => {
    const placed = layoutBubbles(
      [
        { key: 'a', text: 'anyone want courgettes?', x: 140, y: 300, maxWidth: 150, meta: false },
        { key: 'b', text: 'day 3 at the new job!', x: 150, y: 310, maxWidth: 150, meta: false },
        { key: 'c', text: 'sleepy', x: 380, y: 200, maxWidth: 150, meta: false },
      ],
      393,
      100,
    );
    const [b, a] = [placed.find((p) => p.key === 'b'), placed.find((p) => p.key === 'a')];
    expect(a && b && a.top + a.height <= b.top).toBe(true);
    for (const p of placed) {
      expect(p.left).toBeGreaterThanOrEqual(10);
      expect(p.left + p.width).toBeLessThanOrEqual(383);
      expect(p.top).toBeGreaterThanOrEqual(100);
    }
    expect(placed.find((p) => p.key === 'c')?.tail).toBe('right');
  });
});
