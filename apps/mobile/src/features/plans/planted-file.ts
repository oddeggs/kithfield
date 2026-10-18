import { File, Paths } from 'expo-file-system';

import type { Planted, PlantedStore } from './planted';

/** The plantings waiting for their "in", in a small file in the app's documents. */
export function filePlantedStore(name = 'planted-seeds.json'): PlantedStore {
  const file = new File(Paths.document, name);
  return {
    read: async () => {
      if (!file.exists) return [];
      try {
        const list = JSON.parse(await file.text()) as unknown;
        return Array.isArray(list) ? (list as Planted[]) : [];
      } catch {
        return [];
      }
    },
    write: async (planted) => {
      await file.write(JSON.stringify(planted));
    },
  };
}
