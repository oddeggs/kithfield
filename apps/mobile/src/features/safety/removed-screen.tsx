import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useFarm } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { PERSON_KEYS } from '../../ui/session/sign-out';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { seasonHere } from '../settings/format';
import { useKitColors } from '../settings/kit/colors';
import { useDesignTop } from '../settings/kit/layout';
import { KText } from '../settings/kit/text';
import { openPage, siteUrl } from '../settings/links';
import { usePhoneZone } from '../settings/time-zone';
import { removalFor, shownAfter, wasShown, type RemovalNotice } from './removal';

/**
 * You're no longer on a farm: shown once per removal, calm, and it never says who. It reads the
 * removal from the farm the phone holds, so a link to a farm you weren't removed from closes.
 */
export function RemovedScreen({ farm }: { readonly farm: string }) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const zone = usePhoneZone();
  const { width } = useWindowDimensions();
  const client = useDataClient();
  const { person } = useSession();
  const replica = useFarm(farm);
  const [notice, setNotice] = useState<RemovalNotice | null>(null);
  useEffect(() => {
    if (replica === null) return;
    let live = true;
    void client.events(farm, { limit: 200 }).then(
      (events) => {
        if (!live) return;
        const found = person ? removalFor(replica.state, person.id, events) : null;
        const stored = SecureStore.getItem(PERSON_KEYS.removalShown);
        if (found === null || wasShown(stored, found.key)) {
          router.back();
          return;
        }
        void SecureStore.setItemAsync(PERSON_KEYS.removalShown, shownAfter(stored, found.key));
        setNotice(found);
      },
      () => live && router.back(),
    );
    return () => {
      live = false;
    };
  }, [client, farm, person, replica]);
  if (notice === null) return <View style={{ flex: 1, backgroundColor: palette.background }} />;
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
          {t('safety.removed.title', { farm: notice.farmName })}
        </Txt>
        <KText kind="sheetBody" multiline align="center" color={palette.body}>
          {notice.by === 'safety' ? t('safety.removed.bySafety') : t('safety.removed.byKeeper')}
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
