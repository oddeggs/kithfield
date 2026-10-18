import { clearOnboarded, type OnboardedStore } from './onboarded';

export interface ForgetDeps {
  /** Wipes this person's tables and stops their sockets (`DataClient.signOut({force: true})`). */
  readonly wipe: () => Promise<unknown>;
  /** Forgets the session's bearer and person (`Session.signOut()`). */
  readonly signOut: () => Promise<void>;
  readonly store: OnboardedStore;
  /** Tells the shell there is no person any more, so nothing keeps acting as the removed one. */
  readonly dropped: () => void;
}

/**
 * Forgets this phone's person, as when the age check refuses and the server removes them: the
 * tables, the session, what the phone remembered of them, then the shell's own idea of who is
 * here. Each step runs even when one before it fails, since the person is already gone.
 */
export async function forgetPerson(deps: ForgetDeps): Promise<void> {
  await deps.wipe().catch(() => undefined);
  await deps.signOut().catch(() => undefined);
  await clearOnboarded(deps.store).catch(() => undefined);
  deps.dropped();
}
