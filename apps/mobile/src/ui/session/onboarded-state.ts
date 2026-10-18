import type { Me } from '@kithfield/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  clearOnboarded,
  isOnboarded,
  readOnboarded,
  writeOnboarded,
  type OnboardedStore,
} from './onboarded';

export interface OnboardedDeps {
  /** Where the phone remembers who it saw onboarded (the Keychain on the phone). */
  readonly store: OnboardedStore;
  /** `GET /v1/me` for the person the session holds. */
  readonly me: () => Promise<Me>;
}

type Known = { readonly person: string; readonly onboarded: boolean };

/**
 * Whether `person` is onboarded, answered on the first render: someone this phone remembers is
 * in at once (so a cold start's deep link or push lands inside), then `GET /v1/me` confirms in the
 * background and new Terms send them back to accept. Someone not remembered is null (the splash
 * stays up) until that read answers, or false when it fails. A new person (a merge, a new sign-in)
 * is read again the same way; no person forgets what the phone remembered.
 */
export function useOnboardedState(
  person: string | null,
  deps: OnboardedDeps,
): { readonly onboarded: boolean | null; readonly recheck: () => Promise<Me> } {
  const { store, me } = deps;
  const [known, setKnown] = useState<Known | null>(null);

  const settle = useCallback(
    async (who: string, answer: Me) => {
      const onboarded = isOnboarded(answer);
      setKnown({ person: who, onboarded });
      await writeOnboarded(store, who, onboarded).catch(() => undefined);
    },
    [store],
  );

  useEffect(() => {
    if (person === null) {
      void clearOnboarded(store).catch(() => undefined);
      return;
    }
    let live = true;
    me().then(
      (answer) => {
        if (live) void settle(person, answer);
      },
      // Offline or refused: someone remembered stays in; anyone else starts at the way in.
      () => {
        if (live && !readOnboarded(store, person)) setKnown({ person, onboarded: false });
      },
    );
    return () => {
      live = false;
    };
  }, [person, me, store, settle]);

  const recheck = useCallback(async () => {
    const answer = await me();
    await settle(answer.person, answer);
    return answer;
  }, [me, settle]);

  // Read on the render that first sees this person, not after an effect: a remembered person is
  // inside before anything else draws.
  const remembered = useMemo(
    () => person !== null && readOnboarded(store, person),
    [person, store],
  );
  const onboarded =
    person === null
      ? null
      : known !== null && known.person === person
        ? known.onboarded
        : remembered
          ? true
          : null;
  return { onboarded, recheck };
}
