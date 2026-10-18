import { Redirect } from 'expo-router';

import type { MediaLab as MediaLabScreen } from '../../features/media/media-lab';

// Required only in development builds: in a release bundle `__DEV__` is false, the branch is
// removed and the lab's code never ships.
const MediaLab = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('../../features/media/media-lab') as { MediaLab: typeof MediaLabScreen }).MediaLab
  : null;

/** Photos, video, files and voice notes through the local API (development only). */
export default function MediaLabRoute() {
  if (MediaLab === null) return <Redirect href="/farm" />;
  return <MediaLab />;
}
