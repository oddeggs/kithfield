import { Camera } from 'expo-camera';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';

import { createAsks, openAskSheet, type Device, type Permission } from './asks';

const read = (p: { granted: boolean; canAskAgain: boolean }): Permission => ({
  granted: p.granted,
  canAskAgain: p.canAskAgain,
});

/**
 * Asks for the mic before Join in, or the camera before Light lantern, as the fire room needs:
 * `'allowed'`, or `'declined'` (Just listen; stay as your critter).
 */
export const askFor = createAsks({
  current: async (device: Device) =>
    read(
      device === 'mic'
        ? await getRecordingPermissionsAsync()
        : await Camera.getCameraPermissionsAsync(),
    ),
  request: async (device: Device) =>
    read(
      device === 'mic'
        ? await requestRecordingPermissionsAsync()
        : await Camera.requestCameraPermissionsAsync(),
    ),
  sheet: openAskSheet,
});
