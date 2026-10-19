import type { FarmId } from '@kithfield/contracts';
import { SEASONS } from '@kithfield/farm';
import { router } from 'expo-router';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm } from '../../data';
import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { say } from '../farm/farm-copy';
import { typeAt } from '../farm/type-at';
import { seasonRange } from './guide-copy';
import { useGuideLook } from './guide-look';
import { RoundButton } from './parts';

const CARD_H = 240;

/**
 * The farm in each season, by its keeper's hemisphere: the farm scene for spring, summer, autumn
 * and winter with their months and plants, and how seasons follow the keeper's calendar. The
 * design's four-across board, laid out as one column for the phone.
 */
export function SeasonsScreen({ farm }: { readonly farm: FarmId }) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  const look = useGuideLook();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const state = useFarm(farm)?.state ?? null;
  const hemisphere = state?.hemisphere ?? 'north';
  const cardW = width - 32;
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 56,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
          gap: 22,
        }}
      >
        <Txt variant="displayL" accessibilityRole="header" multiline>
          {t('fieldGuide.seasonsPage.title')}
        </Txt>
        {SEASONS.map((season) => (
          <View key={season} style={{ gap: 8 }}>
            <View
              style={{
                height: CARD_H,
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: look.seasonCardShadow,
              }}
            >
              <ArtStill scene="farm" width={cardW} height={CARD_H} attrs={{ season }} t={1.2} />
            </View>
            <Txt variant="displayS" multiline style={typeAt('displayS', 19, 20.9, fontLocale)}>
              {seasonRange(t, season, hemisphere, state?.season.season === season)}
            </Txt>
            <Txt
              variant="caption"
              multiline
              color={palette.secondary}
              style={typeAt('caption', 13.5, 18.9, fontLocale)}
            >
              {say(t, `fieldGuide.seasonsPage.${season}`)}
            </Txt>
          </View>
        ))}
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 18,
            backgroundColor: palette.panel,
          }}
        >
          <ArtIcon name="sun" size={24} color={palette.text} />
          <Txt
            variant="body"
            multiline
            color={look.paragraph}
            style={{ ...typeAt('body', 14, 20.3, fontLocale), flex: 1 }}
          >
            {t('fieldGuide.seasonsPage.note')}
          </Txt>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', top: insets.top - 1, left: 16 }}>
        <RoundButton label={t('fieldGuide.back')} onPress={() => router.back()} />
      </View>
    </View>
  );
}
