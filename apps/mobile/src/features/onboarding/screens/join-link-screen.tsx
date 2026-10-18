import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { useDataClient } from '../../../data';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useSession } from '../../../ui/session/session';
import { useOnboardingApi } from '../flow-state';
import { InviteLanding } from '../invite-landing';
import { joinAsMember } from '../join-member';

const FARM = '/farm';

/** The farm preview for someone already through the way in: they move in as who they are. */
function JoinAsMember({ code }: { readonly code: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const api = useOnboardingApi();
  const data = useDataClient();
  const deps = useMemo(
    () => ({
      me: () => data.api.me(),
      join: (c: string, j: Parameters<typeof data.api.join>[1]) => data.api.join(c, j),
    }),
    [data],
  );
  const toFarm = () => router.replace(FARM);
  return (
    <InviteLanding
      code={code}
      api={api}
      back={() => (router.canGoBack() ? router.back() : toFarm())}
      elsewhere={{ label: t('shell.notFound.action'), onPress: toFarm }}
      accept={async () => {
        const result = await joinAsMember(code, deps);
        if (result === 'ok') toFarm();
        return result;
      }}
    />
  );
}

/**
 * Where an opened invite link lands (`/i/<code>` is sent here). Someone not through the way in
 * goes to the way in's own invite, to sign in and become a critter; someone through it sees the
 * farm and moves in with the name and critter they have. Nothing shows while the session is read.
 */
export function JoinLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { status, onboarded } = useSession();
  if (status === 'loading') return null;
  if (status !== 'signedIn' || !onboarded) {
    return <Redirect href={{ pathname: '/i/[code]', params: { code } }} />;
  }
  return <JoinAsMember code={code} />;
}
