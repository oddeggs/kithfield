import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as Device from 'expo-device';
import { getCalendars } from 'expo-localization';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';

import type { DataRuntime } from '../../data';
import { syncPush, type KeyStore, type PushDeps } from './push-sync';

const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** The Keychain, readable after first unlock like the session itself. */
export const keychain: KeyStore = {
  getItem: (key) => SecureStore.getItem(key, KEYCHAIN),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN),
};

const DEVICE_KEY = 'kithfield.device';

interface Extra {
  readonly apiBase: string;
  readonly eas?: { readonly projectId?: string };
}

const extra = () => Constants.expoConfig?.extra as Extra;

/** The device id this install made on first use: a UUID kept in the Keychain. */
async function deviceId(): Promise<string> {
  const kept = keychain.getItem(DEVICE_KEY);
  if (kept) return kept;
  const made = randomUUID();
  await keychain.setItemAsync(DEVICE_KEY, made);
  return made;
}

/** The phone's side of `syncPush`: Expo's permission and token, the API with the session. */
export function pushDeps(runtime: DataRuntime<unknown>): PushDeps {
  const send = async (method: 'PUT' | 'PATCH', path: string, body: unknown) => {
    const response = await fetch(`${extra().apiBase}${path}`, {
      method,
      credentials: 'omit',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(await runtime.session.headers()),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}`);
  };
  return {
    store: keychain,
    permission: async () => (await Notifications.getPermissionsAsync()).granted,
    token: async () => {
      // Only a real device has a push token.
      if (!Device.isDevice) return null;
      const projectId = extra().eas?.projectId;
      const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
      return token.data;
    },
    timeZone: () => getCalendars()[0]?.timeZone ?? 'UTC',
    deviceId,
    device: {
      platform: 'ios',
      name: (Device.deviceName ?? Device.modelName ?? 'iPhone').slice(0, 64),
      appVersion: Constants.expoConfig?.version ?? '0.0.0',
    },
    registerDevice: (device, body) =>
      send('PUT', `/v1/devices/${encodeURIComponent(device)}`, body),
    updateSettings: (update) => send('PATCH', '/v1/me/settings', update),
  };
}

/** Sends the time zone and push token for `person` when they change, once per launch. */
export function PushRegistration({
  person,
  deps,
}: {
  readonly person: string | null;
  readonly deps: PushDeps;
}) {
  useEffect(() => {
    if (person === null) return;
    // A failed send is tried again next launch; nothing to show for it.
    syncPush(person, deps).catch(() => undefined);
  }, [person, deps]);
  return null;
}
