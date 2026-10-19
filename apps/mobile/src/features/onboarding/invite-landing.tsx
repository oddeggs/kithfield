import type { InvitePreview } from '@kithfield/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { ErrorState } from '../../ui/components/state-shell';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { Txt } from '../../ui/type/text';
import {
  AxFlow,
  Body,
  BottomBar,
  ErrorLine,
  Title,
  TopBar,
  useDesignTop,
  useSceneAttrs,
} from './kit';
import type { OnboardingApi } from './onboarding-api';
import { SceneArt } from './scene-art';

type Preview =
  | { readonly kind: 'loading' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'ready'; readonly invite: InvitePreview };

/** How accepting went: on into the farm, or a farm that turned out full or gone meanwhile. */
export type AcceptResult = 'ok' | 'full' | 'gone' | 'failed';

/**
 * A friend's invite as the app shows it: who saved the cottage and on which farm, the claim scene
 * and "Accept the cottage". A link that's gone, a farm that's full and a server that can't be
 * reached each say so, with a way on (`elsewhere`) or a retry.
 */
export function InviteLanding({
  code,
  api,
  accept,
  back,
  elsewhere,
}: {
  readonly code: string;
  readonly api: OnboardingApi;
  readonly accept: (invite: InvitePreview) => Promise<AcceptResult>;
  readonly back: () => void;
  /** Where a gone or full invite sends the person: their own farm, or the farm they have. */
  readonly elsewhere: { readonly label: string; readonly onPress: () => void };
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const ax = useAccessibilitySize();
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setPreview({ kind: 'loading' });
    api.invite(code).then(
      (invite) => setPreview(invite ? { kind: 'ready', invite } : { kind: 'gone' }),
      () => setPreview({ kind: 'unreachable' }),
    );
  }, [api, code]);
  useEffect(load, [load]);

  const art = (
    <ArtStill scene="spot" width={280} height={170} attrs={{ ...scene, name: 'contacts' }} />
  );
  const full = preview.kind === 'ready' && preview.invite.full;
  if (preview.kind === 'gone' || preview.kind === 'unreachable' || full) {
    const unreachable = preview.kind === 'unreachable';
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ErrorState
          art={art}
          title={t(
            full
              ? 'onboarding.join.full.title'
              : unreachable
                ? 'onboarding.join.unreachable.title'
                : 'onboarding.join.gone.title',
          )}
          body={
            full && preview.kind === 'ready'
              ? t('onboarding.join.full.body', { farm: preview.invite.name })
              : t(unreachable ? 'onboarding.join.unreachable.body' : 'onboarding.join.gone.body')
          }
          action={unreachable ? { label: t('onboarding.join.tryAgain'), onPress: load } : elsewhere}
          secondary={{ label: t('onboarding.back'), onPress: back }}
        />
      </View>
    );
  }

  const invite = preview.kind === 'ready' ? preview.invite : null;
  const accepted = async () => {
    if (!invite || busy) return;
    setBusy(true);
    setError(null);
    const result = await accept(invite).catch((): AcceptResult => 'failed');
    setBusy(false);
    if (result === 'full') setPreview({ kind: 'ready', invite: { ...invite, full: true } });
    else if (result === 'gone') setPreview({ kind: 'gone' });
    else if (result === 'failed') setError(t('onboarding.failed'));
  };

  const bar = (
    <TopBar
      onBack={back}
      inset={20}
      center={
        <Txt
          variant="displayS"
          {...(ax ? { align: 'center' as const } : {})}
          style={{ fontSize: 20, lineHeight: 26 }}
        >
          {t('shell.appName')}
        </Txt>
      }
    />
  );
  const words = invite ? (
    <>
      <Title size={28}>
        {invite.from
          ? t('onboarding.join.title', { name: invite.from.name })
          : t('onboarding.join.titleNoName')}
      </Title>
      <Body>{t('onboarding.join.body', { farm: invite.name })}</Body>
    </>
  ) : null;
  const footer = (
    <>
      <ErrorLine text={error} />
      <Button
        label={t('onboarding.join.accept')}
        kind="go"
        onPress={() => void accepted()}
        disabled={!invite || busy}
        haptic="tap"
      />
    </>
  );

  if (ax) {
    return (
      <AxFlow bar={bar} footer={footer}>
        {words ? <View style={{ paddingHorizontal: 24, gap: 6 }}>{words}</View> : null}
        <SceneArt scene="claim" width={width} height={258} attrs={scene} />
      </AxFlow>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {bar}
      {words ? (
        <View style={{ position: 'absolute', top: top(110), left: 24, right: 24, gap: 6 }}>
          {words}
        </View>
      ) : null}
      <SceneArt
        scene="claim"
        width={width}
        height={258}
        attrs={scene}
        style={{ position: 'absolute', top: top(218), left: 0 }}
      />
      <BottomBar>{footer}</BottomBar>
    </View>
  );
}
