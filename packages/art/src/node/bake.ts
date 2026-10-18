import type { Art, SceneRequest } from '../art';
import { ImageFormat } from '../canvas2d/skia-enums';

/**
 * A scene at time `t` as a PNG: the path store screenshots, OG and invite images and the press kit
 * take. (CanvasKit's build has no WebP encoder; sticker packs convert the PNG.)
 */
export function bakeScene(art: Art, req: SceneRequest, t: number): Uint8Array {
  const image = art.image(req, t);
  if (!image) throw new Error(`${req.scene}: nothing drawn`);
  return image.encodeToBytes(ImageFormat.PNG, 100);
}
