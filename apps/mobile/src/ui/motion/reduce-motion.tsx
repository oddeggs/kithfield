import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const ReduceMotionContext = createContext<boolean | null>(null);

/**
 * Reduce Motion, read once for the whole app and kept current when it changes in Settings. Art
 * holds still and every move becomes `motion.fade` (`12 States`, Reduce Motion).
 */
export function ReduceMotionProvider({
  forced,
  children,
}: {
  /** Fixes the setting for a subtree (the developer gallery). */
  readonly forced?: boolean;
  readonly children: ReactNode;
}) {
  // Reanimated reads the setting synchronously at startup, so the first frame is already right.
  const initial = useReducedMotion();
  const [reduce, setReduce] = useState(initial);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    return () => sub.remove();
  }, []);
  return (
    <ReduceMotionContext.Provider value={forced ?? reduce}>{children}</ReduceMotionContext.Provider>
  );
}

/** Whether Reduce Motion is on. Pass it to the motion helpers and `motionFor`. */
export function useReduceMotion(): boolean {
  const reduce = useContext(ReduceMotionContext);
  if (reduce === null) throw new Error('useReduceMotion needs a ReduceMotionProvider');
  return reduce;
}
