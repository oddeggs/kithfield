import { browserStorage } from '../storage';

/**
 * `expo-secure-store` in the browser, which has no Keychain: the same calls on this origin's
 * storage. Metro resolves the module here for web builds only (`metro.config.js`); the phone keeps
 * the real Keychain. Options are accepted and ignored.
 */
export type SecureStoreOptions = Record<string, unknown>;

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_UNLOCKED = 4;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 5;

const store = browserStorage();

export const getItem = (key: string, _options?: SecureStoreOptions): string | null =>
  store.getItem(key);
export const getItemAsync = (key: string, _options?: SecureStoreOptions) => store.getItemAsync(key);
export const setItem = (key: string, value: string, _options?: SecureStoreOptions): void =>
  store.setItem(key, value);
export const setItemAsync = (key: string, value: string, _options?: SecureStoreOptions) =>
  store.setItemAsync(key, value);
export const deleteItemAsync = (key: string, _options?: SecureStoreOptions) =>
  store.deleteItemAsync(key);
export const isAvailableAsync = (): Promise<boolean> => Promise.resolve(true);
export const canUseBiometricAuthentication = (): boolean => false;
