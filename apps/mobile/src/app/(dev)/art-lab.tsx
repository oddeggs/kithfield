import { Redirect } from 'expo-router';

import type { ArtLab as ArtLabScreen } from '../../ui/gallery/art-lab';

// Required only in development builds: in a release bundle `__DEV__` is false, the branch is
// removed and the lab's code never ships.
const ArtLab = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('../../ui/gallery/art-lab') as { ArtLab: typeof ArtLabScreen }).ArtLab
  : null;

/** Full-width scenes in layers, and a loop too big to draw whole (development only). */
export default function ArtLabRoute() {
  if (ArtLab === null) return <Redirect href="/farm" />;
  return <ArtLab />;
}
