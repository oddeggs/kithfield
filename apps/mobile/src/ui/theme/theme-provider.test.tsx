import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { SunPlace } from './sun';
import { ThemeProvider, useSunPlace, useTheme } from './theme-provider';

// React's test environment flag, so `act` works outside a browser.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Noon in London on 19 October 2026: day there, evening in Saigon. */
const NOON_UTC = Date.UTC(2026, 9, 19, 12, 0);
const SAIGON: SunPlace = { lat: 10.82, lng: 106.63 };
const LONDON: SunPlace = { lat: 51.51, lng: -0.13 };

let renderer: ReactTestRenderer | null = null;
let setPlace: (place: SunPlace | null) => void = () => undefined;
let setShown: (shown: boolean) => void = () => undefined;
const seen: string[] = [];

/** A farm screen handing over its town, which can go away or lose its town. */
function FarmScreen() {
  const [place, set] = useState<SunPlace | null>(null);
  setPlace = set;
  useSunPlace(place);
  return null;
}

function App() {
  const [shown, set] = useState(true);
  setShown = set;
  seen.push(useTheme().appearance);
  return shown ? <FarmScreen /> : null;
}

const now = () => seen.at(-1);

beforeEach(async () => {
  jest.useFakeTimers({ now: NOON_UTC });
  seen.length = 0;
  await act(() => {
    renderer = create(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
  });
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = null;
  jest.useRealTimers();
});

describe('the sun place', () => {
  it('follows the system until a farm gives its town', async () => {
    expect(now()).toBe('day');
    await act(() => setPlace(SAIGON));
    expect(now()).toBe('night');
  });

  it("keeps the last farm's town when a screen has none, or goes away", async () => {
    await act(() => setPlace(SAIGON));
    await act(() => setPlace(null));
    expect(now()).toBe('night');
    await act(() => setShown(false));
    expect(now()).toBe('night');
    await act(() => setShown(true));
    expect(now()).toBe('night');
  });

  it('moves to the next farm’s town', async () => {
    await act(() => setPlace(SAIGON));
    await act(() => setPlace(LONDON));
    expect(now()).toBe('day');
  });
});
