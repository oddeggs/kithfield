import { Redirect } from 'expo-router';

import type { NativeLab as NativeLabScreen } from '../../features/native-lab/native-lab';

// Required only in development builds: in a release bundle `__DEV__` is false, the branch is
// removed and the lab's code never ships.
const NativeLab = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('../../features/native-lab/native-lab') as { NativeLab: typeof NativeLabScreen })
      .NativeLab
  : null;

/** Checks that each native module of the depth features is built in (development only). */
export default function NativeLabRoute() {
  if (NativeLab === null) return <Redirect href="/farm" />;
  return <NativeLab />;
}
