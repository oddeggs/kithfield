import { Redirect } from 'expo-router';

import type { SyncLab as SyncLabScreen } from '../../features/sync-lab/sync-lab';

// Required only in development builds: in a release bundle `__DEV__` is false, the branch is
// removed and the lab's code never ships.
const SyncLab = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('../../features/sync-lab/sync-lab') as { SyncLab: typeof SyncLabScreen }).SyncLab
  : null;

/** One farm across phones through the local API, for checking sync by hand (development only). */
export default function SyncLabRoute() {
  if (SyncLab === null) return <Redirect href="/farm" />;
  return <SyncLab />;
}
