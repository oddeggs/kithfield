import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { seasonHere } from '../settings/format';
import { useKitColors } from '../settings/kit/colors';
import { useDesignTop } from '../settings/kit/layout';
import { KText } from '../settings/kit/text';
import { openPage, siteUrl } from '../settings/links';
import { usePhoneZone } from '../settings/time-zone';

const shownKey = (farm: string) => `kithfield.removalShown.${farm.replace(/[^A-Za-z0-9_-]/g, '')}`;

/**
 * You're no longer on a farm: shown once per removal, calm, and it never says who.
 * Opening it again for the same farm closes at once.
 */
export function RemovedScreen({
  farm,
  farmName,
  by,
}: {
  readonly farm: string;
  readonly farmName: string;
  readonly by: 'keeper' | 'safety';
}) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const zone = usePhoneZone();
  const { width } = useWindowDimensions();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const key = shownKey(farm);
    if (SecureStore.getItem(key) === '1') {
      router.back();
      return;
    }
    void SecureStore.setItemAsync(key, '1');
    setReady(true);
  }, [farm]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ArtStill
        scene="spot"
        width={width}
        height={280}
        attrs={{ name: 'removed', season: seasonHere(zone, Date.now()) }}
        style={{ position: 'absolute', top: top(110) }}
      />
      <View
        style={{
          position: 'absolute',
          top: top(410),
          left: 28,
          right: 28,
          gap: 10,
          alignItems: 'center',
        }}
      >
        <Txt
          variant="displayM"
          multiline
          align="center"
          accessibilityRole="header"
          style={{ fontSize: 28, lineHeight: 30.8 }}
        >
          {t('safety.removed.title', { farm: farmName })}
        </Txt>
        <KText kind="sheetBody" multiline align="center" color={palette.body}>
          {by === 'safety' ? t('safety.removed.bySafety') : t('safety.removed.byKeeper')}
        </KText>
        <View
          style={{
            marginTop: 6,
            alignSelf: 'stretch',
            borderRadius: 18,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <KText kind="card" multiline color={kit.body2} style={{ fontSize: 14, lineHeight: 20.3 }}>
            {t('safety.removed.card')}
          </KText>
        </View>
      </View>
      <View
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: Math.max(insets.bottom, 34),
          gap: 6,
        }}
      >
        <Button
          label={t('safety.removed.go')}
          onPress={() => {
            router.dismissAll();
            router.navigate('/(tabs)/chat');
          }}
        />
        <Button
          label={t('safety.removed.rules')}
          kind="text"
          onPress={() => openPage(siteUrl('terms', language))}
        />
      </View>
    </View>
  );
}
