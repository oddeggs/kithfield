import type { Me } from '@kithfield/contracts';

/**
 * Whether a person is through the way in: they have a name and a critter, are old enough, and
 * have accepted the Terms in force. Until then the app shows onboarding instead of the tabs.
 */
export function isOnboarded(me: Me): boolean {
  return (
    me.name !== null &&
    me.critter !== null &&
    me.ageOk &&
    me.termsVersion !== null &&
    me.termsVersion === me.currentTermsVersion
  );
}

/** Where the phone keeps who it last saw onboarded, so a launch never waits on the server. */
export interface OnboardedStore {
  getItem(key: string): string | null;
  setItemAsync(key: string, value: string): Promise<void>;
}

const KEY = 'kithfield.onboarded';

/** True when this phone last saw `person` onboarded. */
export function readOnboarded(store: OnboardedStore, person: string): boolean {
  try {
    return store.getItem(KEY) === person;
  } catch {
    return false;
  }
}

/** Remembers whether `person` is onboarded (clearing it when they are not, as after new Terms). */
export async function writeOnboarded(
  store: OnboardedStore,
  person: string,
  onboarded: boolean,
): Promise<void> {
  const held = store.getItem(KEY);
  if (onboarded && held !== person) await store.setItemAsync(KEY, person);
  if (!onboarded && held === person) await store.setItemAsync(KEY, '');
}

/** Forgets whoever the phone remembered: signing out, or a person the server removed. */
export async function clearOnboarded(store: OnboardedStore): Promise<void> {
  if (store.getItem(KEY)) await store.setItemAsync(KEY, '');
}
