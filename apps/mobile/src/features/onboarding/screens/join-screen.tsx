import type { InvitePreview } from '@kithfield/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { ErrorState } from '../../../ui/components/state-shell';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { afterSignIn, hasSignIn, routes } from '../flow';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import { Body, BottomBar, Title, TopBar, useDesignTop, useSceneAttrs } from '../kit';
import { useProgress } from '../progress';

type Preview =
  | { readonly kind: 'loading' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'ready'; readonly invite: InvitePreview };

/**
 * A friend's invite link, opened in the app (`kithfield.com/i/<code>`): who saved the cottage and
 * on which farm, then signing in and becoming a critter to move in. A link that's gone, or a farm
 * that's full, says so and offers a farm of one's own instead.
 */
export function JoinScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const { api, update } = useFlow();
  const progress = useProgress();
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' });

  const load = useCallback(() => {
    setPreview({ kind: 'loading' });
    api.invite(code).then(
      (invite) => setPreview(invite ? { kind: 'ready', invite } : { kind: 'gone' }),
      () => setPreview({ kind: 'unreachable' }),
    );
  }, [api, code]);
  useEffect(load, [load]);

  const startInstead = () => {
    update({ path: { kind: 'start' }, invite: null });
    router.replace(routes.welcome);
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.welcome));
  const art = (
    <ArtStill scene="spot" width={280} height={170} attrs={{ ...scene, name: 'contacts' }} />
  );

  if (preview.kind === 'gone' || preview.kind === 'unreachable') {
    const gone = preview.kind === 'gone';
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ErrorState
          art={art}
          title={t(gone ? 'onboarding.join.gone.title' : 'onboarding.join.unreachable.title')}
          body={t(gone ? 'onboarding.join.gone.body' : 'onboarding.join.unreachable.body')}
          action={
            gone
              ? { label: t('onboarding.join.startInstead'), onPress: startInstead }
              : { label: t('onboarding.join.tryAgain'), onPress: load }
          }
          secondary={{ label: t('onboarding.back'), onPress: back }}
        />
      </View>
    );
  }
  if (preview.kind === 'ready' && preview.invite.full) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ErrorState
          art={art}
          title={t('onboarding.join.full.title')}
          body={t('onboarding.join.full.body', { farm: preview.invite.name })}
          action={{ label: t('onboarding.join.startInstead'), onPress: startInstead }}
          secondary={{ label: t('onboarding.back'), onPress: back }}
        />
      </View>
    );
  }

  const invite = preview.kind === 'ready' ? preview.invite : null;
  const accept = async () => {
    if (!invite) return;
    update({ path: { kind: 'join', code }, invite });
    const me = await progress.me().catch(() => null);
    if (me && hasSignIn(me)) await progress.go(afterSignIn(me));
    else router.push(routes.signIn);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar
        onBack={back}
        inset={20}
        center={
          <Txt variant="displayS" style={{ fontSize: 20, lineHeight: 20 }}>
            {t('shell.appName')}
          </Txt>
        }
      />
      {invite ? (
        <View style={{ position: 'absolute', top: top(110), left: 24, right: 24, gap: 6 }}>
          <Title size={28}>
            {invite.from
              ? t('onboarding.join.title', { name: invite.from.name })
              : t('onboarding.join.titleNoName')}
          </Title>
          <Body>{t('onboarding.join.body', { farm: invite.name })}</Body>
        </View>
      ) : null}
      <SceneArt
        scene="claim"
        width={width}
        height={258}
        attrs={scene}
        style={{ position: 'absolute', top: top(218), left: 0 }}
      />
      <BottomBar>
        <Button
          label={t('onboarding.join.accept')}
          kind="go"
          onPress={() => void accept()}
          disabled={!invite}
          haptic="tap"
        />
      </BottomBar>
    </View>
  );
}
