import { describe, expect, it } from 'vitest';

import { farm, nightMatrix } from './farm';
import { readDesign, textOf } from './test/design';

const html = readDesign('04 Farm and Chat.dc.html');
const notes = textOf(html.slice(html.indexOf('id="dev-notes"')));

describe('the farm tokens', () => {
  it('take the season fade and the bubbles’ bob from the developer notes', () => {
    expect(notes).toContain(
      `cross-fade the whole scene over ${farm.seasonFade.durationMs / 1000}s`,
    );
    expect(notes).toContain(
      `Bubbles bob ${farm.bob.distance}px on a ${farm.bob.periodMs / 1000}s loop`,
    );
  });

  it('draw every shadow as the farm screens do', () => {
    for (const shadow of Object.values(farm.shadows))
      expect(html).toContain(`box-shadow:${shadow}`);
  });

  it('darken by the art’s night pass, and not at all by day', () => {
    expect(nightMatrix(0)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    const [r, , , , , , g, , , , , , b] = nightMatrix(1);
    // #1B1F3D at 0.82, as `night()` multiplies it in the renderer.
    expect(r).toBeCloseTo(1 - 0.82 * (1 - 0x1b / 255), 6);
    expect(g).toBeCloseTo(1 - 0.82 * (1 - 0x1f / 255), 6);
    expect(b).toBeCloseTo(1 - 0.82 * (1 - 0x3d / 255), 6);
  });
});
