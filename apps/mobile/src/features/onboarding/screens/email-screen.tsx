import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '../../../ui/components/button';
import { TextField } from '../../../ui/components/text-field';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useAccount } from '../../../ui/session/account';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { routes } from '../flow';
import { sendFailure } from '../sign-in-errors';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import { AxFlow, Body, ErrorLine, Title, TopBar, useDesignTop, useSceneAttrs } from '../kit';

/** Enough to be worth sending a code to; the server has the last word. */
export const looksLikeEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());

/**
 * Where the code goes: one field and a button, under the same owl as the letterbox that follows.
 * The design draws only the letterbox; this asks for the address first.
 */
export function EmailScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette } = useTheme();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const ax = useAccessibilitySize();
  const { signIn } = useAccount();
  const { state, update } = useFlow();
  const [email, setEmail] = useState(state.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (busy) return;
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setError(t('onboarding.email.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn.sendEmailCode(address);
      update({ email: address });
      router.push(routes.emailCode);
    } catch (failure) {
      setError(
        t(sendFailure(failure) === 'lockout' ? 'onboarding.code.lockout' : 'onboarding.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const words = (
    <>
      <Title>{t('onboarding.email.title')}</Title>
      <Body>{t('onboarding.email.body')}</Body>
      <View style={{ marginTop: 16, gap: 12 }}>
        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder={t('onboarding.email.placeholder')}
          accessibilityLabel={t('onboarding.email.field')}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="send"
          onSubmitEditing={() => void send()}
        />
        <Button
          label={t('onboarding.email.send')}
          onPress={() => void send()}
          disabled={busy}
          haptic="tap"
        />
        <ErrorLine text={error} />
      </View>
    </>
  );

  if (ax) {
    return (
      <AxFlow bar={<TopBar onBack={() => router.back()} />}>
        <SceneArt
          scene="spot"
          width={280}
          height={170}
          attrs={{ ...scene, name: 'code' }}
          style={{ alignSelf: 'center' }}
        />
        <View style={{ paddingHorizontal: 28, gap: 8 }}>{words}</View>
      </AxFlow>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar onBack={() => router.back()} />
      <SceneArt
        scene="spot"
        width={280}
        height={170}
        attrs={{ ...scene, name: 'code' }}
        style={{ position: 'absolute', top: top(96), left: 56 }}
      />
      <View style={{ position: 'absolute', top: top(286), left: 28, right: 28, gap: 8 }}>
        {words}
      </View>
    </View>
  );
}
