import { beforeAll, describe, expect, it } from 'vitest';

import type { Art } from './art';
import { companionFrame, critterLayers, type CritterLook } from './critter';
import { diff } from './golden/compare';
import { fireLoop, sceneLoop } from './loops';
import { createNodeArt, premulPixels } from './node';

let art: Art;
beforeAll(async () => {
  art = await createNodeArt();
});

/** The layers drawn over each other, as the app composes them. */
function composite(kind: string, look: CritterLook, size: number) {
  const layers = critterLayers(art, kind, look, { size, dir: 1, dpr: 2 });
  const first = layers[0];
  if (!first) throw new Error('no layers');
  const out = art.canvas(first.canvas.width, first.canvas.height);
  const g = out.getContext('2d');
  for (const l of layers) g?.drawImage(l.canvas, 0, 0);
  return { layers, pixels: premulPixels(out.snapshot() ?? fail()) };
}

function fail(): never {
  throw new Error('nothing drawn');
}

describe('critter layers', () => {
  const cases: [
    string,
    CritterLook,
    { coat?: string; mark?: string; outfit?: string; oc?: string },
  ][] = [
    [
      'rabbit',
      { coat: 'grey', mark: 'blaze', outfit: { name: 'scarf', color: '#c96f4f' } },
      { coat: 'grey', mark: 'blaze', outfit: 'scarf', oc: '#c96f4f' },
    ],
    ['fox', { mark: 'spots', accessory: { name: 'beanie' } }, { mark: 'spots', outfit: 'beanie' }],
    ['frog', { coat: 'sky', mark: 'patch' }, { coat: 'sky', mark: 'patch' }],
    [
      'bear',
      { mark: 'freckles', accessory: { name: 'crown' } },
      { mark: 'freckles', outfit: 'crown' },
    ],
  ];

  it.each(cases)('%s composes to the renderer’s own sprite', (kind, look, v) => {
    const { layers, pixels } = composite(kind, look, 120);
    const whole = art.internals.critterSprite(kind, 120, 'open', 1, 2, v);
    const d = diff(pixels, premulPixels(whole.cv.snapshot() ?? fail()));
    expect(layers.length).toBeGreaterThan(1);
    expect(d.mean).toBeLessThan(0.5);
  });

  it('caches each layer once, whatever it is combined with', () => {
    const a = critterLayers(art, 'cat', { accessory: { name: 'straw' } }, { size: 90 });
    const b = critterLayers(
      art,
      'cat',
      { outfit: { name: 'satchel' }, accessory: { name: 'straw' } },
      { size: 90 },
    );
    expect(b[0]?.canvas).toBe(a[0]?.canvas);
    expect(b.find((l) => l.slot === 'accessory')?.canvas).toBe(
      a.find((l) => l.slot === 'accessory')?.canvas,
    );
  });

  it('draws a companion with the critter lifted out and says where the critter stands', () => {
    const frame = companionFrame(art, 'duckling', 'rabbit', { width: 160, height: 160, t: 0.5 });
    expect(frame.critter).not.toBeNull();
    expect(frame.critter?.x).toBeCloseTo(160 * 0.44);
    expect(frame.critter?.y).toBeCloseTo(160 * 0.86);
    const px = premulPixels(frame.image ?? fail());
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if ((px[i] ?? 0) > 0) opaque++;
    expect(opaque).toBeGreaterThan(200);
    // Far less than the critter and duckling together would cover.
    expect(opaque).toBeLessThan((px.length / 4) * 0.15);
  });
});

describe('loops on twos', () => {
  it('holds twelve frames of the fire and picks them by time', () => {
    const loop = fireLoop(art, 80);
    expect(loop.frames).toHaveLength(12);
    expect(loop.indexAt(0)).toBe(0);
    expect(loop.indexAt(0.5)).toBe(6);
    expect(loop.indexAt(1.05)).toBe(0);
    const a = premulPixels(loop.frames[0] ?? fail());
    const b = premulPixels(loop.frames[3] ?? fail());
    expect(diff(a, b).mean).toBeGreaterThan(0);
  });

  it('loops a whole scene over one cached background', () => {
    const loop = sceneLoop(
      art,
      { scene: 'firesmall', width: 120, height: 90, attrs: { season: 'summer' } },
      { frames: 4 },
    );
    expect(loop.frames).toHaveLength(4);
    expect(loop.frameAt(0.1)).toBe(loop.frames[1]);
  });
});

describe('memory', () => {
  it('lets go of every drawing on a memory warning', () => {
    critterLayers(art, 'otter', { coat: 'sea' }, { size: 64 });
    expect(art.cache.bytes).toBeGreaterThan(0);
    art.flush();
    expect(art.cache.bytes).toBe(0);
    expect(art.internals.sprites.size).toBe(0);
  });
});
