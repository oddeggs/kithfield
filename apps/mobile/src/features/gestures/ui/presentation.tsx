import { Stack, router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * How a gesture route shows over the app. The root presents every `(modal)` route as a page
 * sheet; these screens draw their own sheet or cover over the screen they came from, so each
 * sets its own presentation:
 *
 * - `overlay`: transparent over the screen below, with no transition of its own. The screen draws
 *   its scrim, blur and sheet on the UI thread (the + tray, the long-press menu, reactions).
 * - `cover`: full screen, rising from the bottom (scenes with a sheet, Quick Tend, forwarding).
 */
export function Presentation({ as }: { readonly as: 'overlay' | 'cover' }) {
  return (
    <Stack.Screen
      options={
        as === 'overlay'
          ? {
              presentation: 'transparentModal',
              animation: 'none',
              contentStyle: { backgroundColor: 'transparent' },
              gestureEnabled: false,
            }
          : { presentation: 'fullScreenModal', animation: 'slide_from_bottom' }
      }
    />
  );
}

/** How long a closing sheet or menu takes to leave before its route goes. */
export const CLOSE_MS = 240;

/**
 * Closing an overlay: the screen first plays its way out (`closing` turns true), then the route
 * goes. A second close while leaving does nothing.
 */
export function useOverlayClose(): { closing: boolean; close: (then?: () => void) => void } {
  const [closing, setClosing] = useState(false);
  const leaving = useRef(false);
  const close = useCallback((then?: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    Keyboard.dismiss();
    setClosing(true);
    setTimeout(() => {
      if (router.canGoBack()) router.back();
      then?.();
    }, CLOSE_MS);
  }, []);
  return { closing, close };
}

/** Leaves a cover screen. */
export const leave = (): void => {
  if (router.canGoBack()) router.back();
  else router.replace('/farm');
};
