// The app's entry in the browser and on the desktop. Skia draws there through CanvasKit, which
// must be loaded before any route module touches Skia, and the theme's fonts with it: the root
// renders at once (so the dev server's hot reload finds this bundle) and mounts the router once
// both are in. On the desktop, the menu-bar critter's popover is this same page as another
// surface (`?surface=tray`), with no router and no data of its own.
// `@expo/metro-runtime` must come first, for Fast Refresh on the web.
import '@expo/metro-runtime';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { day, night } from '@kithfield/theme';
import { useEffect, useState, type ComponentType } from 'react';
import { View } from 'react-native';

import { webAsset } from './src/web/base-url';
import { openLinksOutside } from './src/web/desktop/external-links';
import { inDesktop, surfaceOf } from './src/web/desktop/tauri';
import type { loadWebFonts } from './src/web/fonts';

// In the desktop app's window, links out of the app open in the system's browser.
if (inDesktop() && surfaceOf(window.location.search) === 'app') openLinksOutside();

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
        if (surfaceOf(window.location.search) === 'tray') {
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after CanvasKit
          const pop = require('./src/web/desktop/tray-popover') as {
            TrayPopoverRoot: ComponentType;
          };
          setApp(() => pop.TrayPopoverRoot);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after CanvasKit
        const entry = require('expo-router/build/qualified-entry') as { App: ComponentType };
        setApp(() => entry.App);
      });
  }, []);
  if (App) return <App />;
  // The paper (or the night sky) while CanvasKit and the fonts load, never a white page.
  if (surfaceOf(window.location.search) === 'tray') return null;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return <View style={{ flex: 1, backgroundColor: dark ? night.sky : day.paper }} />;
}

renderRootComponent(Root);
