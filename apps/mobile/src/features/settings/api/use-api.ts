import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useMemo } from 'react';

import { useDataClient } from '../../../data';
import { connectBlocks, type Blocks } from '../../../data/blocks';
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

/**
 * The one authenticated request every settings and safety call goes through. When the data layer
 * offers its own (on its network and session, with the same 401 handling), this is the one place
 * that changes.
 */
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

/**
 * The phone's block list, connected to the server through these calls and read fresh when a
 * screen that shows or changes it opens.
 */
export function useBlocks(): Blocks {
  const api = useSettingsApi();
  const blocks = useMemo(
    () => connectBlocks({ list: api.blocks, block: api.block, unblock: api.unblock }),
    [api],
  );
  useEffect(() => {
    blocks.refresh().catch(() => undefined);
  }, [blocks]);
  return blocks;
}
