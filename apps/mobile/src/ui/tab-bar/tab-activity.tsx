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

/** The four tabs, by route name. */
export const tabs = ['farm', 'chat', 'seedbed', 'you'] as const;
export type TabName = (typeof tabs)[number];

export interface YouCritter {
  kind: string;
  look?: CritterLook;
}

interface TabActivity {
  dots: Readonly<Record<TabName, boolean>>;
  you: YouCritter | null;
  setDot: (tab: TabName, on: boolean) => void;
  setYou: (critter: YouCritter | null) => void;
}

const TabActivityContext = createContext<TabActivity | null>(null);

const noDots: Record<TabName, boolean> = { farm: false, chat: false, seedbed: false, you: false };

/** What the tab bar shows besides its tabs: which have something new, and your own critter. */
export function TabActivityProvider({ children }: { readonly children: ReactNode }) {
  const [dots, setDots] = useState(noDots);
  const [you, setYou] = useState<YouCritter | null>(null);
  const setDot = useCallback((tab: TabName, on: boolean) => {
    setDots((d) => (d[tab] === on ? d : { ...d, [tab]: on }));
  }, []);
  const value = useMemo(() => ({ dots, you, setDot, setYou }), [dots, you, setDot]);
  return <TabActivityContext.Provider value={value}>{children}</TabActivityContext.Provider>;
}

export function useTabActivity(): TabActivity {
  const value = useContext(TabActivityContext);
  if (value === null) throw new Error('useTabActivity needs a TabActivityProvider');
  return value;
}

/**
 * Shows a honey dot on `tab` while `on` holds, for as long as the caller is mounted. A feature
 * says only that something is new, never how much.
 */
export function useTabDot(tab: TabName, on: boolean): void {
  const { setDot } = useTabActivity();
  useEffect(() => {
    setDot(tab, on);
    return () => setDot(tab, false);
  }, [setDot, tab, on]);
}

/** Puts the person's own critter on the You tab. */
export function useYouCritter(critter: YouCritter | null): void {
  const { setYou } = useTabActivity();
  const key = critter === null ? '' : JSON.stringify(critter);
  useEffect(() => {
    setYou(key === '' ? null : (JSON.parse(key) as YouCritter));
  }, [setYou, key]);
}
