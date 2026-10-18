import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { openDatabase } from '../db/open-database';
import { createApiClient } from './api-client';
import { createDataClient, type DataClient } from './data-client';
import type { SyncReport } from './farm-replica';
import type { FarmRules } from './farm-rules';
import { createOpIdMaker } from './op-id';
import { createRtTokens } from './rt-tokens';
import { authPort, createKithfieldAuthClient, type KithfieldAuthClient } from './auth-client';
import { createSession, type Session, type SessionStorage } from './session';
import type { WebSocketLike } from './socket';

// The session stays on this device and is readable after first unlock, so a background wake can
// still reach the API.
const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keychain: SessionStorage = {
  getItem: (key) => SecureStore.getItem(key, KEYCHAIN),
  getItemAsync: (key) => SecureStore.getItemAsync(key, KEYCHAIN),
  setItem: (key, value) => SecureStore.setItem(key, value, KEYCHAIN),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN),
};

interface AppExtra {
  readonly apiBase: string;
}

export interface DataRuntime<View> {
  readonly client: DataClient<View>;
  readonly session: Session;
  /** Better Auth's client, for the sign-in screens. */
  readonly auth: KithfieldAuthClient;
}

/**
 * Starts the data layer on the phone: opens the encrypted store, wires the session, the API and
 * the sockets, and makes sure there is a session (anonymous on first launch). Offline, a returning
 * install opens on what it holds and writes wait in the outbox; a first launch can't start.
 */
export async function startData<View>(
  rules: FarmRules<View>,
  report?: (report: SyncReport) => void,
): Promise<DataRuntime<View>> {
  const config = Constants.expoConfig;
  const { apiBase } = config?.extra as AppExtra;

  const db = await openDatabase();
  const auth = createKithfieldAuthClient({ apiBase, storage: keychain });
  const session = createSession(authPort(auth), keychain);
  // A first launch with no network throws here; the caller offers to try again.
  await session.ensure();
  const api = createApiClient({ baseUrl: apiBase, fetch, authHeaders: () => session.headers() });
  const client = await createDataClient({
    db,
    rules,
    api,
    tokens: createRtTokens((farm) => api.rtToken(farm)),
    socketBase: apiBase.replace(/^http/, 'ws'),
    openSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
    me: () => session.person()?.person ?? null,
    appState: AppState,
    newOpId: createOpIdMaker(getRandomBytes),
    ...(report ? { report } : {}),
  });

  await client.start();
  return { client, session, auth };
}
