import type { Me } from '@kithfield/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useDataClient } from '../../data';
import { useAccount } from '../../ui/session/account';
import { isOnboarded } from '../../ui/session/onboarded';
import { afterSignIn, resumeAt, termsAccepted, type Route } from './flow';
import { useFlow } from './flow-state';

/**
 * Moving through the way in: after signing in (accepting the Terms in force, which continuing
 * agreed to), after each step, and out to the farm once the person is through.
 */
export function useProgress() {
  const router = useRouter();
  const account = useAccount();
  const data = useDataClient();
  const { api } = useFlow();

  /** Lets the app through, or opens the step still missing (the guard then shows the tabs). */
  const finish = useCallback(async () => {
    const me = await account.recheck();
    if (isOnboarded(me)) return;
    const next = resumeAt(me);
    if (next !== 'done') router.replace(next);
  }, [account, router]);

  /** Goes to `next`, or out to the farm when the way in is done. */
  const go = useCallback(
    async (next: Route | 'done') => {
      if (next === 'done') await finish();
      else router.push(next);
    },
    [finish, router],
  );

  /** The person as the server has them now. */
  const me = useCallback((): Promise<Me> => data.api.me(), [data]);

  /** After any sign-in: the Terms, then the age check or the critter, or straight through. */
  const signedIn = useCallback(async () => {
    let person = await me();
    if (!termsAccepted(person)) {
      await api.acceptTerms({ version: person.currentTermsVersion });
      person = await me();
    }
    await go(afterSignIn(person));
  }, [api, go, me]);

  return useMemo(() => ({ finish, go, me, signedIn }), [finish, go, me, signedIn]);
}
