import { useLocalSearchParams, useRouter } from 'expo-router';

import { useLocale } from '../../../ui/locale/locale-provider';
import { hasSignIn, routes } from '../flow';
import { useFlow } from '../flow-state';
import { InviteLanding } from '../invite-landing';
import { useProgress } from '../progress';

/**
 * A friend's invite link for someone not through the way in yet: accepting the cottage leads on
 * to signing in and becoming a critter, and moving in joins the farm. A gone or full invite offers
 * a farm of one's own instead.
 */
export function JoinScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useLocale();
  const { api, update } = useFlow();
  const progress = useProgress();

  const startInstead = () => {
    update({ path: { kind: 'start' }, invite: null });
    router.replace(routes.welcome);
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.welcome));

  return (
    <InviteLanding
      code={code}
      api={api}
      back={back}
      elsewhere={{ label: t('onboarding.join.startInstead'), onPress: startInstead }}
      accept={async (invite) => {
        update({ path: { kind: 'join', code }, invite });
        const me = await progress.me().catch(() => null);
        if (me && hasSignIn(me)) await progress.go(progress.next(me));
        else router.push(routes.signIn);
        return 'ok';
      }}
    />
  );
}
