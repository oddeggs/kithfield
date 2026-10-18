import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '../../components/chip';
import { useLocale } from '../../locale/locale-provider';
import { useTheme } from '../../theme/theme-provider';
import { Txt } from '../../type/text';
import { BouquetDemo } from './bouquet-demo';
import { ChatDemo } from './chat-demo';
import { CritterDemo } from './critter-demo';
import { DewdropDemo } from './dewdrop-demo';
import { FireDemo } from './fire-demo';
import { FireflyDemo } from './firefly-demo';
import { GiftDemo } from './gift-demo';
import { HarvestDemo } from './harvest-demo';
import { MoveInDemo } from './move-in-demo';
import { PhotoDemo } from './photo-demo';
import { ReactsDemo } from './reacts-demo';
import { SeedDemo } from './seed-demo';
import { StickerDemo } from './sticker-demo';
import { VisitDemo } from './visit-demo';

/** Each storyboard of `18 Motion and Transitions` that travels, in the file's order. */
const DEMOS = [
  { key: 'critter', label: 'motionLab.critter', Demo: CritterDemo },
  { key: 'moveIn', label: 'motionLab.moveIn', Demo: MoveInDemo },
  { key: 'visit', label: 'motionLab.visit', Demo: VisitDemo },
  { key: 'chat', label: 'motionLab.chat', Demo: ChatDemo },
  { key: 'seed', label: 'motionLab.seed', Demo: SeedDemo },
  { key: 'firefly', label: 'motionLab.firefly', Demo: FireflyDemo },
  { key: 'dew', label: 'motionLab.dew', Demo: DewdropDemo },
  { key: 'gift', label: 'motionLab.gift', Demo: GiftDemo },
  { key: 'fire', label: 'motionLab.fire', Demo: FireDemo },
  { key: 'photo', label: 'motionLab.photo', Demo: PhotoDemo },
  { key: 'harvest', label: 'motionLab.harvest', Demo: HarvestDemo },
  { key: 'bouquet', label: 'motionLab.bouquet', Demo: BouquetDemo },
  { key: 'sticker', label: 'motionLab.sticker', Demo: StickerDemo },
  { key: 'reacts', label: 'motionLab.reacts', Demo: ReactsDemo },
] as const;

type Demo = (typeof DEMOS)[number]['key'];

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
        <View
          accessibilityRole="tablist"
          accessibilityLabel={t('motionLab.pick')}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
        >
          {DEMOS.map((d) => (
            <Chip
              key={d.key}
              label={t(d.label)}
              kind={demo === d.key ? 'selected' : 'default'}
              onPress={() => setDemo(d.key)}
            />
          ))}
        </View>
      </View>
      {DEMOS.map(({ key, Demo }) => (demo === key ? <Demo key={key} /> : null))}
    </ScrollView>
  );
}
