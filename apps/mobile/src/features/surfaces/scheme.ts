import Constants from 'expo-constants';

/** The app's own link scheme: `kithfield`, or `kithfield-dev` for Kithfield Dev. */
export function appScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  return first ?? 'kithfield';
}
