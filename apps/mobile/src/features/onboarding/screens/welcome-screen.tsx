import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { Button } from '../../../ui/components/button';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { hasSignIn, resumeAt, routes } from '../flow';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import { useDesignTop, useInks, useSceneAttrs } from '../kit';
import { useProgress } from '../progress';

/**
 * The gate: start a farm, or come in with an invite. Returning people sign in from "Start a
 * farm" too; someone already signed in whose way in was cut short goes back to where they were.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const { update } = useFlow();
  const progress = useProgress();

  useEffect(() => {
    let live = true;
    progress.me().then(
      (me) => {
        if (!live || !hasSignIn(me)) return;
        const next = resumeAt(me);
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

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SceneArt scene="gate" width={width} height={610} attrs={scene} />
      <View style={{ position: 'absolute', top: top(584), left: 28, right: 28, gap: 12 }}>
        <Txt
          variant="displayXL"
          accessibilityRole="header"
          style={{ fontSize: 46, lineHeight: 46, letterSpacing: -0.46 }}
        >
          {t('shell.appName')}
        </Txt>
        <Txt variant="body" multiline color={inks.list} style={{ fontSize: 17, lineHeight: 24.65 }}>
          {t('onboarding.welcome.body')}
        </Txt>
      </View>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 44, gap: 6 }}>
        <Button label={t('onboarding.welcome.start')} onPress={start} haptic="tap" />
        <Button
          label={t('onboarding.welcome.invite')}
          kind="text"
          onPress={() => router.push(routes.invite)}
        />
      </View>
    </View>
  );
}
