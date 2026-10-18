import { Redirect } from 'expo-router';

import type { MotionLab as MotionLabScreen } from '../../ui/travel/lab/motion-lab';

// Required only in development builds: in a release bundle `__DEV__` is false, the branch is
// removed and the lab's code never ships.
const MotionLab = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('../../ui/travel/lab/motion-lab') as { MotionLab: typeof MotionLabScreen }).MotionLab
  : null;

/** The travelling transitions with real art, to play, reverse and interrupt (development only). */
export default function MotionLabRoute() {
  if (MotionLab === null) return <Redirect href="/farm" />;
  return <MotionLab />;
}
