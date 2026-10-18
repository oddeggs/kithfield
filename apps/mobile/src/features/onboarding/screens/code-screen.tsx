import { day } from '@kithfield/theme';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { announcePolitely } from '../../../ui/announce';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useAccount } from '../../../ui/session/account';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { CODE_LENGTH, CodeBoxes, type CodeBoxesHandle } from '../code-boxes';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import { Body, ErrorLine, Title, TopBar, useDesignTop, useInks, useSceneAttrs } from '../kit';
import { useProgress } from '../progress';
import { codeFailure, sendFailure } from '../sign-in-errors';

const EMAIL = '\u0001';

/**
 * The letterbox: six boxes that Mail fills in, sent on the sixth digit. A wrong code shakes the
 * boxes once and empties them. Another code can be sent any time, with no countdown.
 */
export function CodeScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette, appearance } = useTheme();
  const inks = useInks();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const toast = useToast();
  const { signIn } = useAccount();
  const { state } = useFlow();
  const progress = useProgress();
  const boxes = useRef<CodeBoxesHandle>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (full: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.withEmailCode(state.email, full);
    } catch (failure) {
      setBusy(false);
      const why = codeFailure(failure);
      if (why === 'wrong') {
        boxes.current?.shake();
        announcePolitely(t('onboarding.code.wrong'));
      } else {
        setCode('');
        setError(t(why === 'lockout' ? 'onboarding.code.lockout' : 'onboarding.failed'));
      }
      return;
    }
    try {
      await progress.signedIn();
    } catch {
      toast.show(t('onboarding.failed'));
    } finally {
      setBusy(false);
    }
  };

  const change = (next: string) => {
    setCode(next);
    if (next.length === CODE_LENGTH) void submit(next);
  };

  const resend = async () => {
    setError(null);
    try {
      await signIn.sendEmailCode(state.email);
      toast.show(t('onboarding.code.sent'));
    } catch (failure) {
      setError(
        t(sendFailure(failure) === 'lockout' ? 'onboarding.code.lockout' : 'onboarding.failed'),
      );
    }
  };

  const keyboard = useAnimatedKeyboard();
  const noteBottom = useSharedValue(0);
  const { height: screenHeight } = useWindowDimensions();
  const lifted = useAnimatedStyle(() => {
    const covered = noteBottom.get() + 12 - (screenHeight - keyboard.height.get());
    return { transform: [{ translateY: -Math.max(0, covered) }] };
  });

  const [before = '', after = ''] = t('onboarding.code.body', { email: EMAIL }).split(EMAIL);
  const night = appearance === 'night';

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar onBack={() => router.back()} />
      {/* Lifted with the keyboard, so the note about the code stays in sight. */}
      <Animated.View style={[StyleSheet.absoluteFill, lifted]} pointerEvents="box-none">
        <SceneArt
          scene="spot"
          width={280}
          height={170}
          attrs={{ ...scene, name: 'code' }}
          style={{ position: 'absolute', top: top(96), left: 56 }}
        />
        <View style={{ position: 'absolute', top: top(286), left: 28, right: 28, gap: 8 }}>
          <Title>{t('onboarding.code.title')}</Title>
          <Body>
            {before}
            <Text style={{ color: palette.text, fontWeight: '600' }}>{state.email}</Text>
            {after}
          </Body>
        </View>
        <View style={{ position: 'absolute', top: top(400), left: 28, right: 28 }}>
          <CodeBoxes
            ref={boxes}
            value={code}
            onChange={change}
            label={t('onboarding.code.field')}
          />
        </View>
        <View
          style={{
            position: 'absolute',
            top: top(478),
            left: 28,
            right: 28,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Txt
              variant="caption"
              color={palette.secondary}
              style={{ fontSize: 14, lineHeight: 18.2 }}
            >
              {t('onboarding.code.resendLead')}
            </Txt>
            <Press onPress={() => void resend()} darken={false} hitSlop={12}>
              <Txt
                variant="caption"
                color={inks.moss}
                style={{ fontSize: 14, lineHeight: 18.2, fontWeight: '600' }}
              >
                {t('onboarding.code.resend')}
              </Txt>
            </Press>
          </View>
          <Press onPress={() => router.back()} darken={false} hitSlop={12}>
            <Txt
              variant="caption"
              color={palette.secondary}
              style={{ fontSize: 14, lineHeight: 18.2 }}
            >
              {t('onboarding.code.otherEmail')}
            </Txt>
          </Press>
        </View>
        {error ? (
          <View style={{ position: 'absolute', top: top(526), left: 28, right: 28 }}>
            <ErrorLine text={error} />
          </View>
        ) : (
          <View
            onLayout={(e) => noteBottom.set(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
            style={{
              position: 'absolute',
              top: top(526),
              left: 28,
              right: 28,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor: night ? 'rgba(169,196,142,.16)' : day.mossTint,
            }}
          >
            <Txt
              variant="caption"
              multiline
              color={night ? '#a9c48e' : '#3f4d33'}
              style={{ lineHeight: 18.9 }}
            >
              {t('onboarding.code.note')}
            </Txt>
          </View>
        )}
      </Animated.View>
    </View>
  );
}
