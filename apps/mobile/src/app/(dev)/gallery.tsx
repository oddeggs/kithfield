import { Redirect } from 'expo-router';

import type { Gallery as GalleryScreen } from '../../ui/gallery/gallery';

// The gallery is required only in development builds: in a release bundle `__DEV__` is false, the
// branch is removed and the gallery's code never ships.
const Gallery = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- dropped from release bundles
    (require('../../ui/gallery/gallery') as { Gallery: typeof GalleryScreen }).Gallery
  : null;

/** Every component of the library in day and night, English and Vietnamese (development only). */
export default function GalleryRoute() {
  if (Gallery === null) return <Redirect href="/farm" />;
  return <Gallery />;
}
