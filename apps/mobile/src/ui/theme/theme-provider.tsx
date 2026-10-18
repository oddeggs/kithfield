import type { Appearance } from '@kithfield/theme';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, useColorScheme } from 'react-native';

import { recheckDelay, resolveAppearance } from './appearance';
import { palettes, type Palette } from './palette';
import type { SunPlace } from './sun';

export interface Theme {
  appearance: Appearance;
  palette: Palette;
  /** True when night comes from local sunset rather than the system appearance. */
  sunset: boolean;
}

interface ThemeControl {
  /** The town to take sunset from: the open farm's place, or null when there is none. */
  setSunPlace: (place: SunPlace | null) => void;
}

const ThemeContext = createContext<Theme | null>(null);
const ControlContext = createContext<ThemeControl | null>(null);

function useNow(place: SunPlace | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = recheckDelay(now, place);
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [now, place]);
  useEffect(() => {
    // Coming back from the background may cross a sunset the paused timer missed.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);
  return now;
}

/** Day or night for the whole app: night after local sunset and in dark appearance. */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const scheme = useColorScheme();
  const [place, setPlace] = useState<SunPlace | null>(null);
  const now = useNow(place);
  const systemDark = scheme === 'dark';
  const appearance = resolveAppearance({ systemDark, place, nowMs: now });
  const theme = useMemo<Theme>(
    () => ({
      appearance,
      palette: palettes[appearance],
      sunset: appearance === 'night' && !systemDark,
    }),
    [appearance, systemDark],
  );
  const setSunPlace = useCallback((next: SunPlace | null) => {
    setPlace((prev) => (prev?.lat === next?.lat && prev?.lng === next?.lng ? prev : next));
  }, []);
  const control = useMemo(() => ({ setSunPlace }), [setSunPlace]);
  return (
    <ControlContext.Provider value={control}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </ControlContext.Provider>
  );
}

/** A subtree in a fixed appearance: previews and the developer gallery. */
export function ThemeScope({
  appearance,
  children,
}: {
  readonly appearance: Appearance;
  readonly children: ReactNode;
}) {
  const theme = useMemo<Theme>(
    () => ({ appearance, palette: palettes[appearance], sunset: false }),
    [appearance],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) throw new Error('useTheme needs a ThemeProvider');
  return theme;
}

/** Hands the theme the open farm's town, so night follows its sunset. */
export function useSunPlace(place: SunPlace | null): void {
  const control = useContext(ControlContext);
  if (control === null) throw new Error('useSunPlace needs a ThemeProvider');
  const { setSunPlace } = control;
  const lat = place?.lat;
  const lng = place?.lng;
  useEffect(() => {
    setSunPlace(lat === undefined || lng === undefined ? null : { lat, lng });
  }, [setSunPlace, lat, lng]);
}
