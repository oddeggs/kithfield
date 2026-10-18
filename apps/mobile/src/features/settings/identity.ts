import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Asks for Face ID, falling back to the passcode, before something that can't be undone from this
 * phone. A phone with neither set up has nothing to ask, so it goes ahead.
 */
export async function confirmIdentity(prompt: string): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) return true;
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: prompt });
  return result.success;
}
