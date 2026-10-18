import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useMemo } from 'react';

import { useDataClient } from '../../../data';
import { BEARER_KEY } from '../../../data/session';
import { safetyApi, type SafetyApi } from '../../safety/safety-api';
import { createRequest, type Request } from './request';
import { settingsApi, type SettingsApi } from './settings-api';

const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/**
 * The session's bearer header, read where the data layer keeps it. The data layer's own API
 * client has no calls for settings and safety yet; this reads the same Keychain entry its
 * session writes, and a 401 ends the session the same way.
 */
const authHeaders = async (): Promise<Record<string, string>> => {
  const bearer = await SecureStore.getItemAsync(BEARER_KEY, KEYCHAIN);
  return bearer ? { authorization: `Bearer ${bearer}` } : {};
};

function useRequest(): Request {
  const client = useDataClient();
  return useMemo(() => {
    const { apiBase } = Constants.expoConfig?.extra as { apiBase: string };
    return createRequest({
      baseUrl: apiBase,
      fetch: (input, init) => fetch(input, init),
      authHeaders,
      onUnauthorized: () => client.endSession(),
    });
  }, [client]);
}

export function useSettingsApi(): SettingsApi {
  const request = useRequest();
  return useMemo(() => settingsApi(request), [request]);
}

export function useSafetyApi(): SafetyApi {
  const request = useRequest();
  return useMemo(() => safetyApi(request), [request]);
}
