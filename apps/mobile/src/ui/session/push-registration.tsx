import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as Device from 'expo-device';
import { getCalendars } from 'expo-localization';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { AppBundleId } from '@kithfield/contracts';
import { useEffect } from 'react';
import { z } from 'zod';

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
  readonly eas?: { readonly projectId?: string };
}

const extra = () => Constants.expoConfig?.extra as Extra;

/**
 * The device id this install made on first use: a UUID kept in the Keychain. It is the phone's one
 * id with the server (`PUT /v1/devices/:id` ties each session to it in `session_devices`).
 */
export async function deviceId(): Promise<string> {
  const kept = keychain.getItem(DEVICE_KEY);
  if (kept) return kept;
  const made = randomUUID();
  await keychain.setItemAsync(DEVICE_KEY, made);
  return made;
}

/**
 * This build's bundle id (the store app or a development build), so the server pushes its Live
 * Activities on this app's own APNs topic. Absent when the build doesn't say.
 */
export function appBundleId(): { bundleId: string } | Record<string, never> {
  const id = AppBundleId.safeParse(Constants.expoConfig?.ios?.bundleIdentifier);
  return id.success ? { bundleId: id.data } : {};
}

/**
 * The phone's side of `syncPush`: Expo's permission and token, and the data layer's own requests
 * with its session.
 */
export function pushDeps(runtime: DataRuntime<unknown>): PushDeps {
  const send = async (method: 'PUT' | 'PATCH', path: string, body: unknown) => {
    await runtime.client.api.request(z.unknown(), method, path, body);
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
    session: async () => {
      const bearer = (await runtime.session.headers()).authorization ?? '';
      const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, bearer);
      return digest.slice(0, 16);
    },
    device: {
      platform: 'ios',
      name: (Device.deviceName ?? Device.modelName ?? 'iPhone').slice(0, 64),
      appVersion: Constants.expoConfig?.version ?? '0.0.0',
      ...appBundleId(),
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
