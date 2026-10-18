import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { openDatabase } from '../db/open-database';
import { createApiClient } from './api-client';
import type { SyncReport } from './apply-events';
import { authPort, createKithfieldAuthClient, type KithfieldAuthClient } from './auth-client';
import type { HeldElsewhere } from './client-types';
import { createDataClient, type DataClient } from './data-client';
import type { NetworkSwitch, createNetworkSwitch } from './dev-network';
import type { FarmRules } from './farm-rules';
import { createOpIdMaker } from './op-id';
import { createRtTokens } from './rt-tokens';
import { SessionEnded, createSession, type Session, type SessionStorage } from './session';
import { sessionRecheck } from './session-check';
import { createSignIn, type SignIn } from './sign-in';
import type { OpenSocket, WebSocketLike } from './socket';
import { createUnsentNotices, type UnsentNotice } from './unsent-notice';

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

// Kept in the Keychain, which the wipe leaves alone, so the next sign-in can tell the person.
const unsentNotices = createUnsentNotices({
  getItemAsync: (key) => SecureStore.getItemAsync(key, KEYCHAIN),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, KEYCHAIN),
});

/**
 * How many writes never left the phone when its data was last wiped (the session ended from
 * another device, or a sign-out was forced past the warning), for the sign-in screen to tell the
 * person once: null when nothing was lost. Reading it clears it.
 */
export const takeUnsentNotice = (): Promise<UnsentNotice | null> => unsentNotices.take();

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

export interface StartOptions {
  /** What the person keeps outside the data layer (the media queue), for signing out. */
  readonly heldElsewhere?: HeldElsewhere;
}

const platformSocket: OpenSocket = (url) => new WebSocket(url) as unknown as WebSocketLike;

type DevNetwork = { createNetworkSwitch: typeof createNetworkSwitch };

// Required only in development builds: in a release bundle `__DEV__` is false, the branch is
// removed and the switch's code never ships.
const makeNetworkSwitch = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('./dev-network') as DevNetwork).createNetworkSwitch
  : null;

/**
 * Starts the data layer on the phone: opens the encrypted store, wires the session, the API and
 * the sockets, and makes sure there is a person (anonymous on first launch). Offline, a returning
 * install opens on what it holds and writes wait in the outbox; a first launch without a network
 * throws, and the caller offers to try again. A session the server confirms is gone (the launch
 * check, a socket's `session_ended`, or the re-check a 401 asks for) wipes what this person held,
 * as signing out does, and sets `status().sessionEnded`, so the app offers sign-in. One call's 401
 * alone only asks for that re-check (one at a time), and the call is tried again if the session is
 * still live. The bearer stays in the Keychain, so a relaunch finds it ended again rather than
 * making a new anonymous person.
 */
export async function startData<View>(
  rules: FarmRules<View>,
  report: (report: SyncReport) => void = () => undefined,
  options: StartOptions = {},
): Promise<DataRuntime<View>> {
  const { apiBase } = Constants.expoConfig?.extra as AppExtra;
  const reportAll = (event: SyncReport) => {
    // Counted before the wipe, kept where the wipe can't reach.
    unsentNotices.remember(event).catch(() => undefined);
    report(event);
  };
  const network =
    makeNetworkSwitch?.({
      fetch: (input, init) => fetch(input, init),
      openSocket: platformSocket,
    }) ?? null;
  const netFetch = network?.fetch ?? fetch;
  const db = await openDatabase((reason) => reportAll({ type: 'store_reset', reason }));
  const auth = createKithfieldAuthClient({
    apiBase,
    storage: keychain,
    ...(network ? { fetch: network.fetch } : {}),
  });
  const port = authPort(auth);
  const session = createSession(port, keychain);
  // A call's 401 re-checks the session through its refresh, one check at a time. A refresh that
  // finds the session gone tells `session.onEnded`, which wipes (wired once the client exists).
  const recheck = sessionRecheck(async () => {
    await session.refresh();
    return true;
  });
  const api = createApiClient({
    baseUrl: apiBase,
    fetch: netFetch,
    authHeaders: () => session.headers(),
    onUnauthorized: recheck,
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
    report: reportAll,
    ...(options.heldElsewhere ? { heldElsewhere: options.heldElsewhere } : {}),
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
  // The session's refresh (the re-check a 401 asks for, or after a sign-in) found the session
  // gone: the client wipes what the person held.
  session.onEnded(() => client.endSession());
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
