import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { Button } from '../../../ui/components/button';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useAccount } from '../../../ui/session/account';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { routes } from '../flow';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import {
  Body,
  ErrorLine,
  FadeUp,
  Title,
  TopBar,
  useBottom,
  useDesignTop,
  useSceneAttrs,
} from '../kit';
import { useProgress } from '../progress';
import { appleSheet, googleSheet, SheetCancelled, type SheetAnswer } from '../social';

/** Where a sentence's two links go, split around their placeholders. */
const RULES = '\u0001';
const PRIVACY = '\u0002';

/** The art fades into the paper behind the title. */
function PaperFade({ width, top, colour }: { width: number; top: number; colour: string }) {
  return (
    <Canvas style={{ position: 'absolute', left: 0, top, width, height: 140 }} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={140}>
        <LinearGradient start={vec(0, 0)} end={vec(0, 98)} colors={[`${colour}00`, colour]} />
      </Rect>
    </Canvas>
  );
}

/**
 * A key to the gate: Apple, Google or an email code upgrade the phone's anonymous person.
 * Continuing agrees to the house rules and the privacy promise, linked below the buttons.
 */
export function SignInScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette, appearance } = useTheme();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const bottom = useBottom();
  const scene = useSceneAttrs();
  const { signIn } = useAccount();
  const { update } = useFlow();
  const progress = useProgress();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withSheet = async (
    provider: 'apple' | 'google',
    sheet: (nonce: string) => Promise<SheetAnswer>,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.withIdToken(provider, async (nonce) => {
        const answer = await sheet(nonce);
        if (answer.givenName) update({ suggestedName: answer.givenName });
        return answer.token;
      });
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
  const link = (label: string) => (
    <Text
      accessibilityRole="link"
      onPress={() => router.push(routes.houseRules)}
      style={{ color: palette.text, textDecorationLine: 'underline' }}
    >
      {label}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {/* Held at the moment the rabbit is up and about, as the design shows it. */}
      <SceneArt scene="welcome" width={width} height={top(420)} attrs={scene} t={4} />
      <PaperFade width={width} top={top(300)} colour={palette.background} />
      <TopBar onBack={() => router.back()} overArt />
      <View style={{ position: 'absolute', top: top(418), left: 28, right: 28, gap: 8 }}>
        <Title size={32}>{t('onboarding.signIn.title')}</Title>
        <Body>{t('onboarding.signIn.body')}</Body>
      </View>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom, gap: 8 }}>
        <FadeUp delay={0}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              appearance === 'night'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={28}
            style={{ height: 56 }}
            onPress={() => void withSheet('apple', appleSheet)}
          />
        </FadeUp>
        <FadeUp delay={60}>
          <Press
            onPress={() => void withSheet('google', googleSheet)}
            radius={28}
            accessibilityLabel={t('onboarding.signIn.google')}
            style={{
              height: 56,
              borderRadius: 28,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: 'rgba(42,34,29,.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt variant="button" color="#2a221d">
              {t('onboarding.signIn.google')}
            </Txt>
          </Press>
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
          {link(t('onboarding.signIn.rules'))}
          {middle}
          {link(t('onboarding.signIn.privacy'))}
          {after}
        </Txt>
      </View>
    </View>
  );
}
