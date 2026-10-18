import { createRequire } from 'node:module';

import type { SkiaApi } from '../canvas2d/skia-api';

/**
 * React Native Skia's web implementation over CanvasKit: the same Skia API the phone draws with,
 * running in Node. CanvasKit is the build React Native Skia itself depends on.
 */
let loading: Promise<SkiaApi> | null = null;

export function loadNodeSkia(): Promise<SkiaApi> {
  loading ??= (async () => {
    const own = createRequire(import.meta.url);
    const skiaRequire = createRequire(own.resolve('@shopify/react-native-skia/package.json'));
    const init = skiaRequire('canvaskit-wasm') as () => Promise<unknown>;
    const canvasKit = await init();
    const web = skiaRequire('./lib/commonjs/skia/web') as { JsiSkApi: (ck: unknown) => SkiaApi };
    return web.JsiSkApi(canvasKit);
  })();
  return loading;
}
