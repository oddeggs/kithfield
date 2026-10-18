import { router } from 'expo-router';
import { Linking } from 'react-native';

/*
 * The mic and the camera by the fire (`10 On the System`: asking for the microphone, the first
 * time you join in; for the camera, the first time you light your lantern). The farm asks in its
 * own words first, then iOS. Said no (or iOS says no): Join in becomes Just listen, with a quiet
 * Settings link, and nothing asks again in the same session.
 */

export type Device = 'mic' | 'camera';

/** What came of asking: allowed, or listening (no mic) / staying as your critter (no camera). */
export type Answer = 'allowed' | 'declined';

export interface Permission {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}

export interface AskDeps {
  readonly current: (device: Device) => Promise<Permission>;
  readonly request: (device: Device) => Promise<Permission>;
  /** Shows the farm's sheet; answers whether the person said yes there. */
  readonly sheet: (device: Device, name: string | null) => Promise<boolean>;
}

/** Declined this session: not asked again until the app starts afresh. */
const declined = new Set<Device>();

export function createAsks(deps: AskDeps) {
  return async function ask(device: Device, name: string | null = null): Promise<Answer> {
    const now = await deps.current(device);
    if (now.granted) return 'allowed';
    if (declined.has(device) || !now.canAskAgain) return 'declined';
    const yes = await deps.sheet(device, name);
    if (!yes) {
      declined.add(device);
      return 'declined';
    }
    const asked = await deps.request(device);
    if (!asked.granted) declined.add(device);
    return asked.granted ? 'allowed' : 'declined';
  };
}

/** For tests: a fresh session. */
export const forgetDeclined = () => declined.clear();

let pending: { device: Device; resolve: (yes: boolean) => void } | null = null;

/** Opens the farm's sheet and waits for its answer. */
export function openAskSheet(device: Device, name: string | null): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { device, resolve };
    router.push({
      pathname: device === 'mic' ? '/surfaces-mic' : '/surfaces-camera',
      params: name === null ? {} : { name },
    });
  });
}

/** The sheet's answer; a sheet closed any other way counts as no. */
export function answerAskSheet(device: Device, yes: boolean): void {
  if (pending?.device !== device) return;
  const { resolve } = pending;
  pending = null;
  resolve(yes);
}

/** The quiet Settings link once the mic or camera is off for Kithfield. */
export const openSettings = () => void Linking.openSettings();
