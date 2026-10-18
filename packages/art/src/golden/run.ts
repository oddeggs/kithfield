import type { Art } from '../art';
import { createNodeArt, premulPixels } from '../node';
import { ChromeArt } from './chrome';
import { diff, premultiply, type Diff } from './compare';
import { GOLDEN_SCENES, type GoldenScene } from './scenes';

export interface GoldenResult extends Diff {
  scene: GoldenScene;
  chrome: Uint8Array;
  skia: Uint8Array;
  width: number;
  height: number;
  errors: string[];
}

/** Renders each scene in Chrome and through the adapter on CanvasKit, and compares them. */
export async function runGoldens(
  filter: (s: GoldenScene) => boolean = () => true,
  onResult?: (r: GoldenResult) => void,
): Promise<GoldenResult[]> {
  const errors: string[] = [];
  const art: Art = await createNodeArt({ onError: (m) => errors.push(m) });
  const chrome = await ChromeArt.launch();
  const out: GoldenResult[] = [];
  try {
    for (const scene of GOLDEN_SCENES.filter(filter)) {
      errors.length = 0;
      const ref = await chrome.render(scene);
      const cv = art.draw(
        {
          scene: scene.scene,
          width: scene.width,
          height: scene.height,
          dpr: scene.dpr,
          attrs: scene.attrs,
        },
        scene.t,
      );
      const image = cv.snapshot();
      if (!image) throw new Error(`${scene.id}: nothing drawn`);
      const skia = premulPixels(image);
      const chromePx = premultiply(ref.rgba);
      if (ref.width !== cv.width || ref.height !== cv.height) {
        throw new Error(`${scene.id}: ${cv.width}×${cv.height}, Chrome ${ref.width}×${ref.height}`);
      }
      const r = {
        scene,
        chrome: chromePx,
        skia,
        width: ref.width,
        height: ref.height,
        errors: errors.slice(),
        ...diff(chromePx, skia),
      };
      out.push(r);
      onResult?.(r);
    }
  } finally {
    await chrome.close();
    art.flush();
  }
  return out;
}
