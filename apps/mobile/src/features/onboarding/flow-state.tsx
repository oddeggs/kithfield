import type { CreateFarmResponse, InvitePreview, MonthDay } from '@kithfield/contracts';
import Constants from 'expo-constants';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { useAccount } from '../../ui/session/account';
import { keychain } from '../../ui/session/push-registration';
import { useSession } from '../../ui/session/session';
import { choiceOf, FIRST_CHOICE, type CritterChoice } from './critters';
import { readDraft } from './draft';
import type { Path } from './flow';
import { createOnboardingApi, type OnboardingApi } from './onboarding-api';

/** What the way in has gathered so far, held while its screens come and go. */
export interface FlowState {
  readonly path: Path;
  /** The farm an invite opens onto, once read. */
  readonly invite: InvitePreview | null;
  readonly email: string;
  /** A name the Apple or Google sheet gave, to start the name field with. */
  readonly suggestedName: string | null;
  readonly name: string;
  readonly choice: CritterChoice;
  /** Day and month, when the person turned on birthday blooms. */
  readonly birthday: MonthDay | null;
  /** The farm planted on the way in, with its invite. */
  readonly planted: CreateFarmResponse | null;
}

const initial: FlowState = {
  path: { kind: 'start' },
  invite: null,
  email: '',
  suggestedName: null,
  name: '',
  choice: FIRST_CHOICE,
  birthday: null,
  planted: null,
};

interface Flow {
  readonly state: FlowState;
  readonly update: (change: Partial<FlowState>) => void;
  readonly api: OnboardingApi;
}

const FlowContext = createContext<Flow | null>(null);

/** The way in's own calls (the age check, the Terms, invite previews), with the session. */
export function useOnboardingApi(): OnboardingApi {
  const account = useAccount();
  return useMemo(
    () =>
      createOnboardingApi({
        baseUrl: (Constants.expoConfig?.extra as { apiBase: string }).apiBase,
        fetch: (input, init) => fetch(input, init),
        authHeaders: account.authHeaders,
      }),
    [account],
  );
}

/** Holds the way in's state for its screens, and its calls to the API. */
export function FlowProvider({ children }: { readonly children: ReactNode }) {
  const person = useSession().person?.id ?? null;
  // A way in cut short after the critter was chosen picks up with that critter.
  const [state, setState] = useState<FlowState>(() => {
    const draft = person ? readDraft(keychain, person) : null;
    return draft ? { ...initial, name: draft.name, choice: choiceOf(draft.critter) } : initial;
  });
  const api = useOnboardingApi();
  const flow = useMemo<Flow>(
    () => ({ state, api, update: (change) => setState((s) => ({ ...s, ...change })) }),
    [state, api],
  );
  return <FlowContext.Provider value={flow}>{children}</FlowContext.Provider>;
}

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (flow === null) throw new Error('useFlow needs the onboarding layout');
  return flow;
}
