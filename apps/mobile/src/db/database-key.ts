import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_NAME = 'kithfield.database-key';

// Readable after first unlock, so the app can open the store when iOS wakes it in the background.
// Not "this device only": the key travels with encrypted backups and device moves, together with
// the file, so the outbox (writes not yet sent) survives them.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The SQLCipher key: 32 random bytes made on first launch and kept in the Keychain, as hex.
 * `created` says it was just made, so any file already there was written under another key. A
 * Keychain read that fails (rather than finding nothing) throws, so a locked Keychain never
 * costs the outbox.
 */
export async function databaseKey(): Promise<{ key: string; created: boolean }> {
  const existing = await SecureStore.getItemAsync(KEY_NAME, OPTIONS);
  if (existing) return { key: existing, created: false };
  const key = hex(getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, OPTIONS);
  return { key, created: true };
}
