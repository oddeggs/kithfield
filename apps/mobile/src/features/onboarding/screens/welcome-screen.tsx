import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../ui/components/button';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { AX_FONT_SCALE } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
import { NightVeil } from '../../farm/panel';
import { hasSignIn, routes } from '../flow';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import { PaperFade } from '../fades';
import { AxFlow, useInks, useSceneAttrs } from '../kit';
import { useProgress } from '../progress';
import { useWayInWindow } from '../way-in-frame';

/**
 * The gate: start a farm, or come in with an invite. Returning people sign in from "Start a
 * farm" too; someone already signed in whose way in was cut short goes back to where they were.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const { width, fontScale } = useWayInWindow();
  const ax = fontScale >= AX_FONT_SCALE;
  const insets = useSafeAreaInsets();
  const scene = useSceneAttrs();
  const { update } = useFlow();
  const progress = useProgress();

  useEffect(() => {
    let live = true;
    progress.me().then(
      (me) => {
        if (!live || !hasSignIn(me)) return;
        const next = progress.resume(me);
        if (next === 'done') void progress.finish();
        else if (next !== routes.welcome) router.replace(next);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
    // Once, when the way in opens.
  }, []);

  const start = () => {
    update({ path: { kind: 'start' }, invite: null });
    router.push(routes.signIn);
  };

  const title = (
    <Txt
      variant="displayXL"
      accessibilityRole="header"
      // The app's name is one word, never broken: it grows up to twice its size and then fits the line.
      maxFontSizeMultiplier={2}
      numberOfLines={1}
      adjustsFontSizeToFit
      style={{ fontSize: 46, lineHeight: 46, letterSpacing: -0.46 }}
    >
      {t('shell.appName')}
    </Txt>
  );
  const body = (
    <Txt variant="body" multiline color={inks.list} style={{ fontSize: 17, lineHeight: 24.65 }}>
      {t('onboarding.welcome.body')}
    </Txt>
  );
  const buttons = (
    <>
      <Button label={t('onboarding.welcome.start')} onPress={start} haptic="tap" />
      <Button
        label={t('onboarding.welcome.invite')}
        kind="text"
        onPress={() => router.push(routes.invite)}
      />
    </>
  );

  // At the accessibility sizes the gate sits above the words, and everything scrolls.
  if (ax) {
    return (
      <AxFlow bar={<View style={{ height: insets.top }} />} footer={buttons}>
        <View>
          <SceneArt scene="gate" width={width} height={360} attrs={scene} />
          <NightVeil width={width} height={360} />
        </View>
        <View style={{ paddingHorizontal: 28, gap: 12 }}>
          {title}
          {body}
        </View>
      </AxFlow>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SceneArt scene="gate" width={width} height={610} attrs={scene} />
      {/* The gate has no night of its own: after dark it takes the farm's night pass. */}
      <NightVeil width={width} height={610} />
      {/* The gate already fades into paper by day; at night it fades into the sky. */}
      {scene.night ? <PaperFade width={width} top={470} height={140} /> : null}
      {/* The words sit just above the buttons, so a longer language grows upward. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 44 }}>
        <View style={{ paddingHorizontal: 28, gap: 12, marginBottom: 7 }}>
          {title}
          {body}
        </View>
        <View style={{ paddingHorizontal: 24, gap: 6 }}>{buttons}</View>
      </View>
    </View>
  );
}
