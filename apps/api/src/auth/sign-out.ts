import type { Bindings } from '../env';
import { authFor } from './instance';

/**
 * What else ends when a phone signs itself out (`POST /auth/sign-out`). Better Auth only deletes
 * the session; the device that session registered must also stop getting pushes, lose its action
 * key and close its sockets, as signing it out from another device does. Steps are registered by
 * the parts that hold those things, so auth needn't know them.
 */
export type SignOutStep = (env: Bindings, person: string, session: string) => Promise<void>;

const steps = new Set<SignOutStep>();

/** Adds a sign-out step; the returned function removes it again. */
export function registerSignOutStep(step: SignOutStep): () => void {
  steps.add(step);
  return () => {
    steps.delete(step);
  };
}

/** Runs the steps for the session these headers carry, if any; a failure never stops sign-out. */
export async function beforeSignOut(env: Bindings, headers: Headers): Promise<void> {
  let session;
  try {
    session = await authFor(env).api.getSession({ headers });
  } catch {
    return;
  }
  if (!session) return;
  for (const step of steps) {
    try {
      await step(env, session.user.id, session.session.id);
    } catch (error) {
      console.error('sign-out: a step failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
