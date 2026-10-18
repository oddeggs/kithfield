import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  DataProvider,
  kithfieldRules,
  startData,
  useDataStatus,
  type DataRuntime,
  type HeldElsewhere,
  type SessionPerson,
  type SyncReport,
} from '../../data';
import { ArtStill } from '../art/art-view';
import { ErrorState } from '../components/state-shell';
import { useLocale } from '../locale/locale-provider';
import { AccountProvider, useOnboarded, useRuntimeAccount } from './account';
import { PushRegistration, pushDeps } from './push-registration';
import { SessionProvider, signedOut, type Session } from './session';

type Runtime = DataRuntime<unknown>;

/**
 * What the data layer reports (never content): logged in development builds. Error reporting
 * (Sentry) takes these over when it is wired.
 */
const report = (event: SyncReport) => {
  if (__DEV__) console.log(`[data] ${JSON.stringify(event)}`);
};

type Phase =
  | { readonly kind: 'starting' }
  | { readonly kind: 'ready'; readonly runtime: Runtime }
  | { readonly kind: 'failed' };

/**
 * The session as the shell reads it: signed in while the data layer has a person it can use, and
 * onboarded once that person is through the way in.
 */
function SessionBridge({
  runtime,
  children,
}: {
  readonly runtime: Runtime;
  readonly children: ReactNode;
}) {
  const { sessionEnded } = useDataStatus();
  const [person, setPerson] = useState<SessionPerson | null>(() => runtime.session.person());
  useEffect(() => {
    const off = runtime.session.onPersonChanged((_from, to) => setPerson(to));
    return () => void off();
  }, [runtime]);
  const id = sessionEnded || person === null ? null : person.person;
  const { onboarded, recheck } = useOnboarded(runtime, id);
  // A person the server removed (the age check) is dropped here too, so nothing acts as them.
  const dropped = useCallback(() => setPerson(null), []);
  const account = useRuntimeAccount(runtime, id, recheck, dropped);
  const push = useMemo(() => pushDeps(runtime), [runtime]);
  const session = useMemo<Session>(() => {
    if (id === null) return signedOut;
    if (onboarded === null) return { status: 'loading', person: { id }, onboarded: false };
    return { status: 'signedIn', person: { id }, onboarded };
  }, [id, onboarded]);
  return (
    <AccountProvider account={account}>
      <PushRegistration person={onboarded ? id : null} deps={push} />
      <SessionProvider session={session}>{children}</SessionProvider>
    </AccountProvider>
  );
}

/** A first launch that couldn't reach the server: there is nothing to open yet, so offer a retry. */
function StartFailed({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useLocale();
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <ErrorState
      art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'error' }} />}
      title={t('shell.startFailed.title')}
      body={t('shell.startFailed.body')}
      action={{ label: t('shell.startFailed.action'), onPress: onRetry }}
    />
  );
}

/**
 * Starts the data layer once and puts it under the app: its client in `<DataProvider>`, its
 * session in the shell's `SessionProvider`. Nothing below renders while it starts, so the splash
 * stays up; a returning install starts from what the phone holds even offline.
 */
export function DataSlot({
  heldElsewhere,
  children,
}: {
  /** What the person keeps outside the data layer (the media queue): signing out clears it. */
  readonly heldElsewhere?: HeldElsewhere;
  readonly children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  // One start per attempt, even when an effect runs twice in development.
  const started = useRef<Promise<Runtime> | null>(null);
  // Read when the data layer starts; a later change doesn't restart it.
  const held = useRef(heldElsewhere);

  useEffect(() => {
    if (phase.kind !== 'starting') return;
    started.current ??= startData<unknown>(
      kithfieldRules,
      report,
      held.current ? { heldElsewhere: held.current } : {},
    );
    let live = true;
    started.current.then(
      (runtime) => live && setPhase({ kind: 'ready', runtime }),
      () => live && setPhase({ kind: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [phase]);

  const retry = useCallback(() => {
    started.current = null;
    setPhase({ kind: 'starting' });
  }, []);

  if (phase.kind === 'starting') return null;
  if (phase.kind === 'failed') {
    return (
      <SessionProvider session={signedOut}>
        <StartFailed onRetry={retry} />
      </SessionProvider>
    );
  }
  const { runtime } = phase;
  return (
    <DataProvider client={runtime.client} rules={kithfieldRules} network={runtime.network}>
      <SessionBridge runtime={runtime}>{children}</SessionBridge>
    </DataProvider>
  );
}
