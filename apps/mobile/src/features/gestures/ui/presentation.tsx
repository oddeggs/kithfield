import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

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
