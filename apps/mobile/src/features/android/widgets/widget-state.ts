import {
  APP_GROUP_PATHS,
  SURFACES_VERSION,
  type SurfaceData,
  type SurfaceFarm,
} from '@kithfield/contracts';
import { Directory, File } from 'expo-file-system';

import { litAt } from '../../surfaces/image-plan';
import { androidSurfaceRoot } from '../surface-root';

/*
 * What the home-screen widgets draw from: the files the surfaces wrote (`SurfaceData`, the person
 * they were written for, and the PNGs), read back in the widgets' background task. Images go to
 * the widget as data URIs; the widget library takes no file paths.
 */

/** Whose surfaces these are: `PERSON_FILE` in `surfaces/clear`, which redraws these widgets. */
const PERSON_FILE = 'surfaces/person.json';

export interface WidgetState {
  readonly data: SurfaceData | null;
  readonly me: string | null;
  /** A PNG the surfaces rendered, as a data URI, or null when it isn't there. */
  readonly image: (name: string) => `data:image${string}` | null;
}

function readJson(root: Directory, path: string): unknown {
  const file = new File(root, path);
  if (!file.exists) return null;
  try {
    return JSON.parse(file.textSync()) as unknown;
  } catch {
    return null;
  }
}

export function readWidgetState(root: Directory = androidSurfaceRoot()): WidgetState {
  const raw = readJson(root, APP_GROUP_PATHS.data) as SurfaceData | null;
  const person = readJson(root, PERSON_FILE) as { person?: unknown } | null;
  const extras = new Directory(root, 'android');
  const image = (name: string): `data:image${string}` | null => {
    for (const dir of [root, extras]) {
      const file = new File(dir, APP_GROUP_PATHS.images + name);
      if (file.exists) return `data:image/png;base64,${file.base64Sync()}`;
    }
    return null;
  };
  return {
    data: raw !== null && raw.version === SURFACES_VERSION ? raw : null,
    me: typeof person?.person === 'string' ? person.person : null,
    image,
  };
}

/** The farm the widgets show: the one with the newest activity, as on iOS. */
export function newestFarm(data: SurfaceData | null): SurfaceFarm | null {
  if (data === null) return null;
  let newest: SurfaceFarm | null = null;
  for (const farm of data.farms) {
    if (newest === null || farm.updatedAt > newest.updatedAt) newest = farm;
  }
  return newest;
}

/** The farm's title: its name, or the friend's on a visit. */
export const titleOf = (farm: SurfaceFarm): string => farm.name ?? farm.with?.name ?? '';

/** The species whose windows are lit at `now`. */
export const litKinds = (farm: SurfaceFarm, now: number): Set<string> => litAt(farm, now);
