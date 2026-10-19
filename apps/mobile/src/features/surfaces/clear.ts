import { ExtensionStorage } from '@bacons/apple-targets';

import { surfaces } from '../../../modules/surfaces';
import { groupRoot, nativeGroupStore, type GroupStore } from './group-store';

/*
 * Signing out, or another person on this phone: nothing of the last person may stay on the Home
 * Screen, the Lock Screen or in the share sheet. Everything the app wrote for the surfaces goes
 * (`surfaces/`: the data, the images, shares not yet sent), every Live Activity ends, and the
 * widgets redraw empty.
 */

/** Everything the app writes for its extensions lives under this folder of the App Group. */
export const SURFACES_FOLDER = 'surfaces/';

export interface ClearDeps {
  readonly group: GroupStore | null;
  readonly activities: {
    readonly list: () => Promise<readonly { readonly id: string }[]>;
    readonly end: (id: string) => Promise<void>;
  };
  readonly reload: () => void;
}

export async function clearSurfaces(deps: ClearDeps): Promise<void> {
  try {
    deps.group?.deleteFolder(SURFACES_FOLDER);
  } catch {
    // Go on: the activities and widgets still need clearing.
  }
  try {
    for (const { id } of await deps.activities.list()) await deps.activities.end(id);
  } catch {
    // An activity that can't be ended ends on its own when its time is up.
  }
  deps.reload();
}

/** Where the app notes whose surfaces these are (the extensions read it to say "you"). */
export const PERSON_FILE = `${SURFACES_FOLDER}person.json`;

/**
 * Whether what the surfaces hold was written for someone other than `me` (a sign-in that merged
 * into another person, or a sign-out that didn't get to clear them). Unreadable counts as someone
 * else's: clearing costs only a redraw.
 */
export async function writtenForSomeoneElse(group: GroupStore, me: string): Promise<boolean> {
  const raw = await group.read(PERSON_FILE);
  if (raw === null) return false;
  try {
    return (JSON.parse(raw) as { person?: unknown }).person !== me;
  } catch {
    return true;
  }
}

/** Clears the surfaces on this phone; see `clearSurfaces`. Safe where they aren't built in. */
export function clearSurfacesForSignOut(): Promise<void> {
  const root = groupRoot();
  return clearSurfaces({
    group: root === null ? null : nativeGroupStore(root),
    activities: {
      list: () => surfaces?.listActivities() ?? Promise.resolve([]),
      end: (id) => surfaces?.endActivity(id, null) ?? Promise.resolve(),
    },
    reload: () => {
      try {
        ExtensionStorage.reloadWidget();
      } catch {
        // No widgets here (tests, Android).
      }
    },
  });
}
