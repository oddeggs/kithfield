import { Directory, Paths } from 'expo-file-system';

import { nativeGroupStore, type GroupStore } from '../surfaces/group-store';

/*
 * Android has no App Group: the surfaces' files (`APP_GROUP_PATHS`) live in the app's own
 * documents, where the home-screen widgets' task reads them back.
 */

const FOLDER = 'surfaces-group';

/** The folder the surfaces write into on Android. */
export function androidSurfaceRoot(): Directory {
  const root = new Directory(Paths.document, FOLDER);
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  return root;
}

/** Android's own extras beside the shared files (the widgets' icons), with their own manifest. */
export function androidExtrasStore(): GroupStore {
  const root = new Directory(androidSurfaceRoot(), 'android');
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  return nativeGroupStore(root);
}
