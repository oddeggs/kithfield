import type { Me } from '@kithfield/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useDataClient } from '../../data';
import { useAccount } from '../../ui/session/account';
import { isOnboarded } from '../../ui/session/onboarded';
import { keychain } from '../../ui/session/push-registration';
import { useSession } from '../../ui/session/session';
import { readDraft } from './draft';
import { afterSignIn, resumeAt, routes, termsStep, type Route } from './flow';
import { useFlow } from './flow-state';
import type { MoveInDeps } from './move-in';

/**
 * Moving through the way in: after signing in (accepting the first Terms, which continuing agreed
 * to), after each step, and out to the farm once the person is through.
 */
export function useProgress() {
  const router = useRouter();
  const account = useAccount();
  const data = useDataClient();
  const person = useSession().person?.id ?? null;
  const { api } = useFlow();

  /** A critter chosen on this phone for a farm not planted yet. */
  const draft = useCallback(() => (person ? readDraft(keychain, person) : null), [person]);

  /** Where the way in goes next for this person. */
  const next = useCallback((me: Me) => afterSignIn(me, draft()), [draft]);
  const resume = useCallback((me: Me) => resumeAt(me, draft()), [draft]);

  /** Lets the app through, or opens the step still missing (the guard then shows the tabs). */
  const finish = useCallback(async () => {
    const me = await account.recheck();
    if (isOnboarded(me)) return;
    const step = resume(me);
    if (step !== 'done') router.replace(step);
  }, [account, resume, router]);

  /** Goes to `step`, or out to the farm when the way in is done. */
  const go = useCallback(
    async (step: Route | 'done') => {
      if (step === 'done') await finish();
      else router.push(step);
    },
    [finish, router],
  );

  /** The person as the server has them now. */
  const me = useCallback((): Promise<Me> => data.api.me(), [data]);

  /** After any sign-in: the Terms, then the age check or the critter, or straight through. */
  const signedIn = useCallback(async () => {
    let person = await me();
    switch (termsStep(person)) {
      case 'accept':
        await api.acceptTerms({ version: person.currentTermsVersion });
        person = await me();
        break;
      case 'show':
        // New Terms are shown, never accepted on the person's behalf.
        router.push(routes.acceptTerms);
        return;
      case 'done':
        break;
    }
    await go(next(person));
  }, [api, go, me, next, router]);

  /** The calls moving in makes, with the draft kept in the Keychain. */
  const moveInDeps = useMemo<MoveInDeps>(
    () => ({
      store: keychain,
      join: (code, join) => data.api.join(code, join),
      createFarm: (farm) => data.api.createFarm(farm),
      updateProfile: (update) => data.api.updateProfile(update),
    }),
    [data],
  );

  return useMemo(
    () => ({ person, draft, next, resume, finish, go, me, signedIn, moveInDeps }),
    [person, draft, next, resume, finish, go, me, signedIn, moveInDeps],
  );
}
