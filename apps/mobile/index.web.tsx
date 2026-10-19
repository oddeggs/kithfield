// The app's entry in the browser and on the desktop. Skia draws there through CanvasKit, which
// must be loaded before any route module touches Skia, and the theme's fonts with it: the root
// renders at once (so the dev server's hot reload finds this bundle) and mounts the router once
// both are in.
// `@expo/metro-runtime` must come first, for Fast Refresh on the web.
import '@expo/metro-runtime';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { useEffect, useState, type ComponentType } from 'react';

import { webAsset } from './src/web/base-url';
import type { loadWebFonts } from './src/web/fonts';

const canvasKit = LoadSkiaWeb({ locateFile: (file: string) => webAsset(file) });

function Root() {
  const [App, setApp] = useState<ComponentType | null>(null);
  useEffect(() => {
    void canvasKit
      .then(() => {
        // Modules that touch Skia are loaded only now that CanvasKit is in.
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after CanvasKit
        const fonts = require('./src/web/fonts') as { loadWebFonts: typeof loadWebFonts };
        return fonts.loadWebFonts();
      })
      .then(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after CanvasKit
        const entry = require('expo-router/build/qualified-entry') as { App: ComponentType };
        setApp(() => entry.App);
      });
  }, []);
  return App ? <App /> : null;
}

renderRootComponent(Root);
