import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { BEARER_KEY } from '../../data/session';
import { createMediaApi, type MediaApi } from './media-api';

/*
 * The media endpoints on this phone: the API the data layer talks to, with the session it keeps
 * in the Keychain. Until the data layer's API client carries these three calls, this reads the
 * same bearer token with the same Keychain options the data layer writes it with.
 */

const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

let api: MediaApi | null = null;

export function nativeMediaApi(): MediaApi {
  if (api !== null) return api;
  const { apiBase } = Constants.expoConfig?.extra as { apiBase: string };
  api = createMediaApi({
    baseUrl: apiBase,
    fetch: (input, init) => fetch(input, init),
    authHeaders: async () => {
      const token = await SecureStore.getItemAsync(BEARER_KEY, KEYCHAIN);
      return token ? { authorization: `Bearer ${token}` } : {};
    },
  });
  return api;
}
