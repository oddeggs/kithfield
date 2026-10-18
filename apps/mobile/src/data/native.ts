import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { openDatabase } from '../db/open-database';
import { createApiClient } from './api-client';
import type { SyncReport } from './apply-events';
import { authPort, createKithfieldAuthClient, type KithfieldAuthClient } from './auth-client';
import { createDataClient, type DataClient } from './data-client';
import { createNetworkSwitch, type NetworkSwitch } from './dev-network';
import type { FarmRules } from './farm-rules';
import { createOpIdMaker } from './op-id';
import { createRtTokens } from './rt-tokens';
import { SessionEnded, createSession, type Session, type SessionStorage } from './session';
import { createSignIn, type SignIn } from './sign-in';
import type { OpenSocket, WebSocketLike } from './socket';

// Readable after first unlock, so a background wake can still reach the API. It travels with
// encrypted backups and device moves, like the database key, so a restored phone stays signed in.
const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
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
  /** Apple, Google and email-code sign-in, for the sign-in screens. */
  readonly signIn: SignIn;
  /** Better Auth's client, for anything the helpers don't cover. */
  readonly auth: KithfieldAuthClient;
  /** Cuts the data layer's network, as losing signal does. Development builds only; else null. */
  readonly network: NetworkSwitch | null;
}

const platformSocket: OpenSocket = (url) => new WebSocket(url) as unknown as WebSocketLike;

/**
 * Starts the data layer on the phone: opens the encrypted store, wires the session, the API and
 * the sockets, and makes sure there is a person (anonymous on first launch). Offline, a returning
 * install opens on what it holds and writes wait in the outbox; a first launch without a network
 * throws, and the caller offers to try again. A session the server no longer knows starts the
 * client with `status().sessionEnded`, so the app opens on its data and offers sign-in.
 */
export async function startData<View>(
  rules: FarmRules<View>,
  report: (report: SyncReport) => void = () => undefined,
): Promise<DataRuntime<View>> {
  const { apiBase } = Constants.expoConfig?.extra as AppExtra;
  // In a release bundle `__DEV__` is false and the switch is never made.
  const network = __DEV__
    ? createNetworkSwitch({
        fetch: (input, init) => fetch(input, init),
        openSocket: platformSocket,
      })
    : null;
  const netFetch = network?.fetch ?? fetch;
  const db = await openDatabase((reason) => report({ type: 'store_reset', reason }));
  const auth = createKithfieldAuthClient({
    apiBase,
    storage: keychain,
    ...(network ? { fetch: network.fetch } : {}),
  });
  const port = authPort(auth);
  const session = createSession(port, keychain);
  const api = createApiClient({
    baseUrl: apiBase,
    fetch: netFetch,
    authHeaders: () => session.headers(),
  });

  let ended = false;
  await session.ensure().catch((error: unknown) => {
    if (!(error instanceof SessionEnded)) throw error;
    ended = true;
  });

  const client = await createDataClient({
    db,
    rules,
    api,
    tokens: createRtTokens((farm) => api.rtToken(farm)),
    socketBase: apiBase.replace(/^http/, 'ws'),
    openSocket: network?.openSocket ?? platformSocket,
    me: () => session.person()?.person ?? null,
    appState: AppState,
    newOpId: createOpIdMaker(getRandomBytes),
    report,
  });

  const signIn = createSignIn({
    auth: port,
    session,
    fetchNonce: () => api.signInNonce(),
    sha256Hex: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  });
  // A sign-in that merged this phone into another person, or one after the session ended:
  // reconnect as whoever the session now is.
  session.onPersonChanged(() => client.personChanged());
  const resumeAfterSignIn = <T>(person: Promise<T>): Promise<T> =>
    person.then((value) => {
      if (client.status().sessionEnded) client.personChanged();
      return value;
    });

  if (ended) client.endSession();
  await client.start();
  return {
    client,
    session,
    auth,
    network,
    signIn: {
      ...signIn,
      withIdToken: (provider, openSheet) =>
        resumeAfterSignIn(signIn.withIdToken(provider, openSheet)),
      withEmailCode: (email, code) => resumeAfterSignIn(signIn.withEmailCode(email, code)),
    },
  };
}
