/**
 * The path the web build is served under (`/app` when hosted, empty in development). Expo
 * inlines `EXPO_BASE_URL` from `experiments.baseUrl` when it bundles.
 */
export const BASE_URL: string = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');

/** A file copied into `public/`, served beside the app. */
export const webAsset = (file: string): string => `${BASE_URL}/${file}`;
