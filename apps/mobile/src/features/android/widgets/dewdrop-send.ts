import type { FarmId } from '@kithfield/contracts';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { createOpIdMaker } from '../../../data/op-id';
import { BEARER_KEY } from '../../../data/session';

/*
 * A dewdrop left from the home screen, with the app closed: the farm's command over HTTP with the
 * phone's session, under a fresh op id. The app catches up on it the next time it opens.
 */

const newOpId = createOpIdMaker(getRandomBytes);

export async function sendDewdrop(farm: FarmId, fetcher: typeof fetch = fetch): Promise<boolean> {
  const apiBase = (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase;
  const bearer = await SecureStore.getItemAsync(BEARER_KEY, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  if (apiBase === undefined || !bearer) return false;
  try {
    const response = await fetcher(`${apiBase}/v1/farms/${encodeURIComponent(farm)}/cmd`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ opId: newOpId(), kind: 'dewdrop', payload: {} }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
