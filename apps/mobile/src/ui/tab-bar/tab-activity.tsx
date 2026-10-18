import type { CritterLook } from '@kithfield/art';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { countDot, dotsOf, noDotCounts, type DotCounts } from './dot-counts';
import type { TabName } from './tabs';

export interface YouCritter {
  kind: string;
  look?: CritterLook;
}

interface Setters {
  addDot: (tab: TabName) => void;
  removeDot: (tab: TabName) => void;
  setYou: (critter: YouCritter | null) => void;
}

// State and setters live apart, so a screen that only sets a dot never re-renders when one changes.
const SettersContext = createContext<Setters | null>(null);
const DotsContext = createContext<Readonly<Record<TabName, boolean>> | null>(null);
const YouContext = createContext<YouCritter | null>(null);

/** What the tab bar shows besides its tabs: which have something new, and your own critter. */
export function TabActivityProvider({ children }: { readonly children: ReactNode }) {
  const [counts, setCounts] = useState<DotCounts>(noDotCounts);
  const [you, setYou] = useState<YouCritter | null>(null);
  const addDot = useCallback((tab: TabName) => setCounts((c) => countDot(c, tab, 1)), []);
  const removeDot = useCallback((tab: TabName) => setCounts((c) => countDot(c, tab, -1)), []);
  const setters = useMemo(() => ({ addDot, removeDot, setYou }), [addDot, removeDot]);
  const dots = useMemo(() => dotsOf(counts), [counts]);
  return (
    <SettersContext.Provider value={setters}>
      <DotsContext.Provider value={dots}>
        <YouContext.Provider value={you}>{children}</YouContext.Provider>
      </DotsContext.Provider>
    </SettersContext.Provider>
  );
}

function useSetters(): Setters {
  const value = useContext(SettersContext);
  if (value === null) throw new Error('needs a TabActivityProvider');
  return value;
}

/** Which tabs show a honey dot (for the tab bar). */
export function useTabDots(): Readonly<Record<TabName, boolean>> {
  const value = useContext(DotsContext);
  if (value === null) throw new Error('useTabDots needs a TabActivityProvider');
  return value;
}

/** The person's own critter for the You tab, or null before it is known. */
export function useYou(): YouCritter | null {
  return useContext(YouContext);
}

/**
 * Shows a honey dot on `tab` while `on` holds and the caller is mounted. Several callers may ask
 * for the same tab's dot; it stays until the last lets go. A feature says only that something is
 * new, never how much.
 */
export function useTabDot(tab: TabName, on: boolean): void {
  const { addDot, removeDot } = useSetters();
  useEffect(() => {
    if (!on) return;
    addDot(tab);
    return () => removeDot(tab);
  }, [addDot, removeDot, tab, on]);
}

/** Puts the person's own critter on the You tab. */
export function useYouCritter(critter: YouCritter | null): void {
  const { setYou } = useSetters();
  const key = critter === null ? '' : JSON.stringify(critter);
  useEffect(() => {
    setYou(key === '' ? null : (JSON.parse(key) as YouCritter));
  }, [setYou, key]);
}
