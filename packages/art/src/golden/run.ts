import type { Art } from '../art';
import { createNodeArt, premulPixels } from '../node';
import { ChromeArt } from './chrome';
import {
  diff,
  GOLDEN_MEAN_LIMIT,
  GOLDEN_TEXT_TILE_LIMIT,
  GOLDEN_TILE_LIMIT,
  premultiply,
  type Diff,
} from './compare';
import { GOLDEN_SCENES, type GoldenScene } from './scenes';

export interface GoldenResult extends Diff {
  scene: GoldenScene;
  chrome: Uint8Array;
  skia: Uint8Array;
  width: number;
  height: number;
  errors: string[];
  /** Characters the adapter had no glyph for (the browser would have fallen back to a system font). */
  missingGlyphs: number;
}

/** Why a result fails the gate; empty when it passes. */
export function gateFailures(r: GoldenResult): string[] {
  const out: string[] = [];
  const tileLimit = r.scene.text ? GOLDEN_TEXT_TILE_LIMIT : GOLDEN_TILE_LIMIT;
  if (r.mean > GOLDEN_MEAN_LIMIT) out.push(`mean ${r.mean.toFixed(3)} > ${GOLDEN_MEAN_LIMIT}`);
  if (r.worstTile > tileLimit) out.push(`worst tile ${r.worstTile.toFixed(2)} > ${tileLimit}`);
  if (r.missingGlyphs > 0) out.push(`${r.missingGlyphs} missing glyphs`);
  out.push(...r.errors);
  return out;
}

export interface GoldenRunner {
  /** Draws `chromeScene` in Chrome and `skiaScene` (the same one unless given) on CanvasKit. */
  compare(chromeScene: GoldenScene, skiaScene?: GoldenScene): Promise<GoldenResult>;
  close(): Promise<void>;
}

export async function goldenRunner(): Promise<GoldenRunner> {
  const errors: string[] = [];
  const art: Art = await createNodeArt({ onError: (m) => errors.push(m) });
  const chrome = await ChromeArt.launch();
  return {
    async compare(scene, skiaScene = scene) {
      errors.length = 0;
      art.env.fonts.missingGlyphs = 0;
      const ref = await chrome.render(scene);
      const cv = art.draw(
        {
          scene: skiaScene.scene,
          width: skiaScene.width,
          height: skiaScene.height,
          dpr: skiaScene.dpr,
          attrs: skiaScene.attrs,
        },
        skiaScene.t,
      );
      const image = cv.snapshot();
      if (!image) throw new Error(`${scene.id}: nothing drawn`);
      const skia = premulPixels(image);
      const chromePx = premultiply(ref.rgba);
      if (ref.width !== cv.width || ref.height !== cv.height) {
        throw new Error(`${scene.id}: ${cv.width}×${cv.height}, Chrome ${ref.width}×${ref.height}`);
      }
      return {
        scene,
        chrome: chromePx,
        skia,
        width: ref.width,
        height: ref.height,
        errors: errors.slice(),
        missingGlyphs: art.env.fonts.missingGlyphs,
        ...diff(chromePx, skia, ref.width, ref.height),
      };
    },
    async close() {
      await chrome.close();
      art.flush();
    },
  };
}

/** Renders each scene in Chrome and through the adapter on CanvasKit, and compares them. */
export async function runGoldens(
  filter: (s: GoldenScene) => boolean = () => true,
  onResult?: (r: GoldenResult) => void,
): Promise<GoldenResult[]> {
  const runner = await goldenRunner();
  const out: GoldenResult[] = [];
  try {
    for (const scene of GOLDEN_SCENES.filter(filter)) {
      const r = await runner.compare(scene);
      out.push(r);
      onResult?.(r);
    }
  } finally {
    await runner.close();
  }
  return out;
}
