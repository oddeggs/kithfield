import { deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';

import { databaseKey } from './database-key';
import { prepareDatabase, type OpenedDatabase, type StoreReset } from './prepare-database';

export const DATABASE_NAME = 'kithfield.db';

/** Opens the phone's encrypted store (SQLCipher through expo-sqlite, the key in the Keychain). */
export function openDatabase(
  onReset: (reason: StoreReset) => void,
  name: string = DATABASE_NAME,
): Promise<OpenedDatabase> {
  return prepareDatabase(
    {
      open: () => openDatabaseAsync(name),
      remove: () =>
        deleteDatabaseAsync(name).then(
          () => true,
          () => false,
        ),
      key: databaseKey,
      requireCipher: true,
    },
    onReset,
  );
}
