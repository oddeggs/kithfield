import { createRequire } from 'node:module';

import type { SkiaApi } from '../canvas2d/skia-api';

/** React Native Skia's private paths this relies on; a Skia upgrade that moves them fails here. */
export const SKIA_WEB_PATH = './lib/commonjs/skia/web';
export const SKIA_TYPES_PATH = './lib/commonjs/skia/types';

function skiaRequire(): NodeJS.Require {
  const own = createRequire(import.meta.url);
  return createRequire(own.resolve('@shopify/react-native-skia/package.json'));
}

/** Requires one of React Native Skia's files, naming the path if it has moved. */
export function requireFromSkia<T>(path: string): T {
  try {
    return skiaRequire()(path) as T;
  } catch (e) {
    throw new Error(
      `@kithfield/art: could not load ${path} from @shopify/react-native-skia. Its web ` +
        `implementation (used to run Skia on CanvasKit in Node) has moved; update SKIA_WEB_PATH ` +
        `and SKIA_TYPES_PATH in packages/art/src/node/skia.ts.`,
      { cause: e },
    );
  }
}

/**
 * React Native Skia's web implementation over CanvasKit: the same Skia API the phone draws with,
 * running in Node. CanvasKit is the build React Native Skia itself depends on.
 */
let loading: Promise<SkiaApi> | null = null;

export function loadNodeSkia(): Promise<SkiaApi> {
  loading ??= (async () => {
    const init = requireFromSkia<() => Promise<unknown>>('canvaskit-wasm');
    const canvasKit = await init();
    const web = requireFromSkia<{ JsiSkApi?: (ck: unknown) => SkiaApi }>(SKIA_WEB_PATH);
    if (typeof web.JsiSkApi !== 'function') {
      throw new Error(`@kithfield/art: ${SKIA_WEB_PATH} no longer exports JsiSkApi`);
    }
    return web.JsiSkApi(canvasKit);
  })();
  return loading;
}
