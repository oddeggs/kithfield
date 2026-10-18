import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '../../components/segmented';
import { useLocale } from '../../locale/locale-provider';
import { useTheme } from '../../theme/theme-provider';
import { Txt } from '../../type/text';
import { ChatDemo } from './chat-demo';
import { CritterDemo } from './critter-demo';
import { FireflyDemo } from './firefly-demo';
import { SeedDemo } from './seed-demo';

type Demo = 'critter' | 'chat' | 'seed' | 'firefly';

/**
 * The travelling transitions with real art, one at a time on a phone-sized stage: each can be
 * played, reversed and interrupted, and each is a cross-fade under Reduce Motion (development only).
 */
export function MotionLab() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [demo, setDemo] = useState<Demo>('critter');
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
      // The stages take their own drags.
      scrollEnabled={demo !== 'chat'}
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
        <Txt variant="displayL" accessibilityRole="header">
          {t('motionLab.title')}
        </Txt>
        <Txt variant="note" multiline color={palette.secondary}>
          {t('motionLab.subtitle')}
        </Txt>
        <Segmented
          label={t('motionLab.pick')}
          value={demo}
          onChange={setDemo}
          segments={[
            { value: 'critter', label: t('motionLab.critter') },
            { value: 'chat', label: t('motionLab.chat') },
            { value: 'seed', label: t('motionLab.seed') },
            { value: 'firefly', label: t('motionLab.firefly') },
          ]}
        />
      </View>
      {demo === 'critter' ? <CritterDemo /> : null}
      {demo === 'chat' ? <ChatDemo /> : null}
      {demo === 'seed' ? <SeedDemo /> : null}
      {demo === 'firefly' ? <FireflyDemo /> : null}
    </ScrollView>
  );
}
