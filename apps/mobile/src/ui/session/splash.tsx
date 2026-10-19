import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useReduceMotion } from '../motion/reduce-motion';
import { useSession } from './session';
import { createSplashHandoff, splashFadeMs } from './splash-handoff';

/** Reduce Motion as the shell last read it: the fade is chosen when the splash goes. */
let reduceNow = false;

/** The app's one launch screen hand-off. */
const handoff = createSplashHandoff({
  hide: () => {
    SplashScreen.setOptions({ duration: splashFadeMs(reduceNow), fade: true });
    void SplashScreen.hideAsync();
  },
  setTimer: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
});

/** Lets the splash go now, as nothing else will draw (the data layer couldn't start). */
export function releaseSplash(): void {
  handoff.ready();
}

/**
 * Keeps the splash up while `waiting`, for a screen that draws in by itself (the farm home). It is
 * let go a frame after `waiting` turns false, so that frame is on screen under it.
 */
export function useSplashHold(waiting: boolean): void {
  useEffect(() => {
    if (!waiting || handoff.hidden) return;
    const release = handoff.hold();
    return () => {
      requestAnimationFrame(release);
    };
  }, [waiting]);
}

/**
 * Lets the splash go once the session is known and the shell's first frame has laid out, unless
 * a screen holds it (`useSplashHold`). The cross-fade is the warm start's, or Reduce Motion's.
 */
export function SplashGate({ children }: { readonly children: ReactNode }) {
  const { status } = useSession();
  const reduce = useReduceMotion();
  reduceNow = reduce;
  const [laidOut, setLaidOut] = useState(false);
  const onLayout = useCallback(() => setLaidOut(true), []);
  useEffect(() => {
    if (laidOut && status !== 'loading') handoff.ready();
  }, [laidOut, status]);
  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {children}
    </View>
  );
}
