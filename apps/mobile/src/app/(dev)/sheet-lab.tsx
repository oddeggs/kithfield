import { Redirect } from 'expo-router';

import type { SheetLab as SheetLabScreen } from '../../ui/gallery/sheet-lab';

// Required only in development builds: in a release bundle `__DEV__` is false, the branch is
// removed and the lab's code never ships.
const SheetLab = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('../../ui/gallery/sheet-lab') as { SheetLab: typeof SheetLabScreen }).SheetLab
  : null;

/** A native sheet sized to what it holds, to check it takes taps (development only). */
export default function SheetLabRoute() {
  if (SheetLab === null) return <Redirect href="/farm" />;
  return <SheetLab />;
}
