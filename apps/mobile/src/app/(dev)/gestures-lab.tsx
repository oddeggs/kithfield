import { Redirect } from 'expo-router';

import type { GesturesLab as GesturesLabScreen } from '../../features/gestures/lab/gestures-lab';

type Lab = { GesturesLab: typeof GesturesLabScreen };

// Required only in development builds: in a release bundle `__DEV__` is false, the branch is
// removed and the lab's code never ships.
const GesturesLab = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('../../features/gestures/lab/gestures-lab') as Lab).GesturesLab
  : null;

/** Each gesture screen, opened with real parameters on a farm you live on (development only). */
export default function GesturesLabRoute() {
  if (GesturesLab === null) return <Redirect href="/farm" />;
  return <GesturesLab />;
}
