import type { SkImage } from '@shopify/react-native-skia';

import { Art, type ArtOptions } from '../art';
import type { ArtCanvas } from '../canvas2d/canvas';
import { AlphaType, ColorType, ImageFormat } from '../canvas2d/skia-enums';
import { nodeFaces } from './fonts';
import { loadNodeSkia } from './skia';

export { loadNodeSkia } from './skia';
export { bakeScene } from './bake';
export { nodeFaces, themeFontDir } from './fonts';

/** The renderer on CanvasKit in Node, with the theme's fonts. */
export async function createNodeArt(options: Partial<ArtOptions> = {}): Promise<Art> {
  const skia = await loadNodeSkia();
  return new Art({ skia, faces: nodeFaces(skia), ...options });
}

/** RGBA pixels, premultiplied, row by row. */
export function premulPixels(image: SkImage): Uint8Array {
  const width = image.width();
  const height = image.height();
  const px = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888 as never,
    alphaType: AlphaType.Premul as never,
  });
  if (!(px instanceof Uint8Array)) throw new Error('Could not read the pixels');
  return px;
}

export function encodePng(source: ArtCanvas | SkImage): Uint8Array {
  const image = 'snapshot' in source ? source.snapshot() : source;
  if (!image) throw new Error('Nothing drawn');
  return image.encodeToBytes(ImageFormat.PNG, 100);
}
