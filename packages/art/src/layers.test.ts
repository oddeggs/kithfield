import type { SkImage } from '@shopify/react-native-skia';
import { describe, expect, it } from 'vitest';

import { Art, type SceneRequest } from './art';
import { BlendMode } from './canvas2d/skia-enums';
import type { SkiaApi } from './canvas2d/skia-api';
import { diff } from './golden/compare';
import { bakeSceneLayers, sceneLayers, type SceneLayers } from './layers';
import { loadNodeSkia, nodeFaces, premulPixels } from './node';

async function newArt(cacheBytes?: number): Promise<{ art: Art; skia: SkiaApi }> {
  const skia = await loadNodeSkia();
  return {
    art: new Art({ skia, faces: nodeFaces(skia), ...(cacheBytes ? { cacheBytes } : {}) }),
    skia,
  };
}

/** The still with each piece of frame `i` copied over it, as the phone draws it. */
function compose(skia: SkiaApi, still: SkImage, layers: SceneLayers, i: number): Uint8Array {
  const surface = skia.Surface.Make(still.width(), still.height());
  if (!surface) throw new Error('no surface');
  const canvas = surface.getCanvas();
  canvas.drawImage(still, 0, 0);
  const paint = skia.Paint();
  paint.setBlendMode(BlendMode.Src);
  for (const p of layers.pieces) {
    const frame = p.frames[i];
    if (!frame) throw new Error('no frame');
    canvas.drawImage(frame, p.x * layers.dpr, p.y * layers.dpr, paint);
  }
  return premulPixels(surface.makeImageSnapshot());
}

const gate: SceneRequest = {
  scene: 'gate',
  width: 200,
  height: 300,
  dpr: 2,
  attrs: { season: 'autumn' },
};

describe('a scene in layers', () => {
  it('draws every frame of the loop exactly, from the still and the moving pieces', async () => {
    const { art, skia } = await newArt();
    const result = sceneLayers(art, gate, { frames: 4 });
    if (!result.ok) throw new Error('over budget');
    const { layers } = result;
    expect(layers.length).toBe(4);
    expect(layers.pieces.length).toBeGreaterThan(0);
    for (const p of layers.pieces) expect(p.frames).toHaveLength(4);
    const still = art.image(gate, layers.start)?.makeNonTextureImage();
    if (!still) throw new Error('no still');
    for (let i = 0; i < 4; i++) {
      const want = premulPixels(art.image(gate, layers.start + i / layers.fps) as SkImage);
      expect(diff(compose(skia, still, layers, i), want).max).toBe(0);
    }
  });

  it('holds much less than the whole loop would', async () => {
    const { art } = await newArt();
    const result = sceneLayers(art, gate);
    if (!result.ok) throw new Error('over budget');
    const whole = 400 * 600 * 4 * 12;
    expect(result.layers.bytes).toBeLessThan(whole / 3);
  });

  it('works a frame at a time, and answers a cached bake at once', async () => {
    const { art } = await newArt();
    const bake = bakeSceneLayers(art, gate, { frames: 3 });
    let steps = 0;
    let step = bake.next();
    while (!step.done) {
      steps++;
      step = bake.next();
    }
    // Two looks after the first, then three frames.
    expect(steps).toBe(5);
    const again = bakeSceneLayers(art, gate, { frames: 3 }).next();
    expect(again.done).toBe(true);
    expect(again.value).toEqual(step.value);
  });

  it('refuses layers over the budget, before drawing their frames', async () => {
    const { art } = await newArt();
    const result = sceneLayers(art, gate, { budget: 1000 });
    expect(result).toMatchObject({ ok: false, reason: 'over_budget', budget: 1000 });
  });
});
