import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

/**
 * Choices that live on this phone only: AI catch-up runs on the phone, so nothing about it goes to
 * the server, and the reading language the app opens in.
 */
const KEYS = {
  aiCatchUp: 'kithfield.pref.aiCatchUp',
  language: 'kithfield.pref.language',
} as const;

export type DevicePref = keyof typeof KEYS;

/** Reads a phone-only choice; null until read, or when it was never set. */
export function useDevicePref(pref: DevicePref): readonly [string | null, (value: string) => void] {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(KEYS[pref]).then(
      (v) => live && setValue(v),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [pref]);
  const set = useCallback(
    (next: string) => {
      setValue(next);
      void SecureStore.setItemAsync(KEYS[pref], next).catch(() => undefined);
    },
    [pref],
  );
  return [value, set];
}

/** The language chosen in Settings, for the app's locale at start (`LocaleProvider.storedChoice`). */
export const storedLanguage = (): string | null => SecureStore.getItem(KEYS.language);
