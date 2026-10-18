import { View } from 'react-native';

import { EmptyState } from '../../../ui/components/state-shell';
import { useLocale } from '../../../ui/locale/locale-provider';
import { roseAttrs, useSceneAttrs } from '../kit';
import { SceneArt } from '../scene-art';
import { useTheme } from '../../../ui/theme/theme-provider';

/**
 * Under the age for the person's country: said kindly, with nothing to fill in again. The server
 * has already removed the person, and the phone has forgotten them; the next launch starts afresh.
 */
export function TooYoungScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const scene = useSceneAttrs();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <EmptyState
        art={<SceneArt scene="plant" width={160} height={170} attrs={roseAttrs(scene, 1)} />}
        title={t('onboarding.tooYoung.title')}
        body={t('onboarding.tooYoung.body')}
      />
    </View>
  );
}
