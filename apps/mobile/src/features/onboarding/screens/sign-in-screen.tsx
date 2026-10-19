import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { takeUnsentNotice, useDataClient, type UnsentNotice } from '../../../data';
import { Button } from '../../../ui/components/button';
import { NoticeCard } from '../../../ui/components/card';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useAccount } from '../../../ui/session/account';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
import { routes } from '../flow';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import { FadeUp, PaperFade } from '../fades';
import {
  AxFlow,
  Body,
  ErrorLine,
  Title,
  TopBar,
  useBottom,
  useDesignTop,
  useSceneAttrs,
} from '../kit';
import { useProgress } from '../progress';
import { pageUrl } from './house-rules-screen';
import {
  appleSheet,
  googleSheet,
  handOverAppleCode,
  SheetCancelled,
  type SheetAnswer,
} from '../social';
import { AppleSignInButton, GoogleSignInButton } from '../ui/provider-buttons';

/** Where a sentence's two links go, split around their placeholders. */
const RULES = '\u0001';
const PRIVACY = '\u0002';

/**
 * A key to the gate: Apple, Google or an email code upgrade the phone's anonymous person.
 * Continuing agrees to the house rules and the privacy promise, linked below the buttons.
 */
export function SignInScreen() {
  const router = useRouter();
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const bottom = useBottom();
  const scene = useSceneAttrs();
  const ax = useAccessibilitySize();
  const { signIn } = useAccount();
  const { api } = useDataClient();
  const { update } = useFlow();
  const progress = useProgress();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Writes lost when the last session ended, told once: reading the notice clears it.
  const [unsent, setUnsent] = useState<UnsentNotice | null>(null);
  useEffect(() => {
    takeUnsentNotice().then(setUnsent, () => undefined);
  }, []);

  const withSheet = async (
    provider: 'apple' | 'google',
    sheet: (nonce: string) => Promise<SheetAnswer>,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let appleCode: string | undefined;
      await signIn.withIdToken(provider, async (nonce) => {
        const answer = await sheet(nonce);
        if (answer.givenName) update({ suggestedName: answer.givenName });
        appleCode = answer.appleCode;
        return answer.token;
      });
      // Signed in as whoever this is now: the code is theirs, for revoking when they leave.
      if (appleCode !== undefined) void handOverAppleCode(api, appleCode);
      await progress.signedIn();
    } catch (failure) {
      if (!(failure instanceof SheetCancelled)) setError(t('onboarding.signIn.failed'));
    } finally {
      setBusy(false);
    }
  };

  const agree = t('onboarding.signIn.agree', { rules: RULES, privacy: PRIVACY });
  const [before = '', rest = ''] = agree.split(RULES);
  const [middle = '', after = ''] = rest.split(PRIVACY);
  const link = (label: string, onPress: () => void) => (
    <Text
      accessibilityRole="link"
      onPress={onPress}
      style={{ color: palette.text, textDecorationLine: 'underline' }}
    >
      {label}
    </Text>
  );

  const words = (
    <>
      <Title size={32}>{t('onboarding.signIn.title')}</Title>
      <Body>{t('onboarding.signIn.body')}</Body>
    </>
  );
  const buttons = (
    <>
      {unsent ? (
        <NoticeCard
          icon="raincloud"
          text={t(
            unsent.reason === 'sign_out'
              ? 'onboarding.signIn.unsent.signOut'
              : 'onboarding.signIn.unsent.sessionEnd',
          )}
          style={{ marginBottom: 8 }}
        />
      ) : null}
      <FadeUp delay={0}>
        <AppleSignInButton onPress={() => void withSheet('apple', appleSheet)} />
      </FadeUp>
      <FadeUp delay={60}>
        <GoogleSignInButton onPress={() => void withSheet('google', googleSheet)} />
      </FadeUp>
      <FadeUp delay={120}>
        <Button
          label={t('onboarding.signIn.email')}
          kind="secondary"
          onPress={() => router.push(routes.email)}
        />
      </FadeUp>
      <ErrorLine text={error} />
      <Txt
        variant="note"
        multiline
        align="center"
        color={palette.secondary}
        style={{ fontSize: 12.5, lineHeight: 18.1, marginTop: 6 }}
      >
        {before}
        {link(t('onboarding.signIn.rules'), () => router.push(routes.houseRules))}
        {middle}
        {link(t('onboarding.signIn.privacy'), () => {
          void WebBrowser.openBrowserAsync(pageUrl('privacy', language), {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
          });
        })}
        {after}
      </Txt>
    </>
  );
  // Held at the moment the rabbit is up and about, as the design shows it.
  const art = <SceneArt scene="welcome" width={width} height={top(420)} attrs={scene} t={4} />;

  if (ax) {
    return (
      <AxFlow bar={<TopBar onBack={() => router.back()} />} footer={buttons} footerGap={8}>
        <View>
          {art}
          <PaperFade width={width} top={top(300)} height={140} />
        </View>
        <View style={{ paddingHorizontal: 28, gap: 8 }}>{words}</View>
      </AxFlow>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {art}
      <PaperFade width={width} top={top(300)} height={140} />
      <TopBar onBack={() => router.back()} overArt />
      <View style={{ position: 'absolute', top: top(418), left: 28, right: 28, gap: 8 }}>
        {words}
      </View>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom, gap: 8 }}>{buttons}</View>
    </View>
  );
}
