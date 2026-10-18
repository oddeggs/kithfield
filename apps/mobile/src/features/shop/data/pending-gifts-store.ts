import * as SecureStore from 'expo-secure-store';

import type { PendingGift } from './pending-gifts';

/* Where pending gifts wait on this phone: a short list per person, in the Keychain. */

const keyOf = (person: string) => `shop.pendingGifts.${person.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export async function readPendingGifts(person: string): Promise<PendingGift[]> {
  try {
    const raw = await SecureStore.getItemAsync(keyOf(person));
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list) ? (list as PendingGift[]) : [];
  } catch {
    return [];
  }
}

async function write(person: string, list: readonly PendingGift[]): Promise<void> {
  try {
    if (list.length === 0) await SecureStore.deleteItemAsync(keyOf(person));
    else await SecureStore.setItemAsync(keyOf(person), JSON.stringify(list));
  } catch {
    // Losing the note costs only the resume; the server still holds the paid gift.
  }
}

/** Adds or replaces one pending gift. */
export async function keepPendingGift(person: string, gift: PendingGift): Promise<void> {
  const list = await readPendingGifts(person);
  await write(person, [...list.filter((g) => g.gift !== gift.gift), gift]);
}

export async function dropPendingGift(person: string, gift: string): Promise<void> {
  const list = await readPendingGifts(person);
  await write(
    person,
    list.filter((g) => g.gift !== gift),
  );
}
