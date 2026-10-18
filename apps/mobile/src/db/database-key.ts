import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync } from 'expo-sqlite';

const KEY_NAME = 'kithfield.database-key';

// This device only, readable after first unlock so the app can open the store when iOS wakes it
// in the background.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The SQLCipher key for this device: 32 random bytes made on first launch and kept in the
 * Keychain, as hex.
 *
 * The key never leaves the phone, but the database file can (an iCloud or Quick Start restore
 * brings it without its key), and then it can never be opened. The file is only a cache of what
 * the server holds, so when a key has to be made, any file already there is deleted and the farms
 * are fetched again. A Keychain read that fails (rather than finding nothing) throws, so a locked
 * Keychain never costs the outbox.
 */
export async function databaseKey(databaseName: string): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME, OPTIONS);
  if (existing) return existing;
  await deleteDatabaseAsync(databaseName).catch(() => undefined);
  const key = hex(getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, OPTIONS);
  return key;
}
