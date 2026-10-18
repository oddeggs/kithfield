import type { FarmId } from '@kithfield/contracts';

import { FarmReplica, type FarmReplicaDeps } from './farm-replica';

/** One replica per farm, each read from SQLite once, on first use. */
export function createReplicas<View>(deps: Omit<FarmReplicaDeps<View>, 'farm'>) {
  const replicas = new Map<FarmId, Promise<FarmReplica<View>>>();
  return {
    get: (farm: FarmId): Promise<FarmReplica<View>> => {
      let found = replicas.get(farm);
      if (!found) {
        found = FarmReplica.open({ ...deps, farm });
        replicas.set(farm, found);
        found.catch(() => replicas.delete(farm));
      }
      return found;
    },
    clear: () => replicas.clear(),
  };
}
