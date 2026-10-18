import { router } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtStill } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useSignOut } from '../../../ui/session/sign-out';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { seasonHere } from '../format';
import { useKitColors } from '../kit/colors';
import { KText } from '../kit/text';
import { usePhoneZone } from '../time-zone';

/** How tall the empty cottage stands at the top. */
const SCENE_HEIGHT = 430;

/**
 * A kind goodbye after the account is set to be deleted. The server has ended every
 * session; closing forgets this phone's copy and returns to the welcome screen.
 */
export function GoodbyeScreen({
  name,
  species,
}: {
  readonly name: string;
  readonly species: string;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const signOut = useSignOut();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const zone = usePhoneZone();
  const [closing, setClosing] = useState(false);
  const close = async () => {
    setClosing(true);
    // The server ended every session already; whatever is unsent can't be sent any more.
    await signOut({ anyway: true });
    router.dismissAll();
  };
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ArtStill
        scene="leftcot"
        width={width}
        height={SCENE_HEIGHT}
        attrs={{ kind: species || 'rabbit', season: seasonHere(zone, Date.now()) }}
        t={1.2}
      />
      <View style={{ marginTop: 18, paddingHorizontal: 28, gap: 10, alignItems: 'center' }}>
        <Txt
          variant="handS"
          color={kit.link}
          style={{ fontSize: 18, lineHeight: 19.8 }}
          align="center"
        >
          {t('settings.goodbye.eyebrow', { name: name.toLocaleLowerCase() })}
        </Txt>
        <Txt
          variant="displayL"
          multiline
          align="center"
          accessibilityRole="header"
          style={{ fontSize: 30, lineHeight: 33 }}
        >
          {name ? t('settings.goodbye.title', { name }) : t('settings.goodbye.titleNoName')}
        </Txt>
        <KText kind="sheetBody" multiline align="center" color={palette.body}>
          {t('settings.goodbye.body')}
        </KText>
      </View>
      <View
        style={{ position: 'absolute', left: 24, right: 24, bottom: Math.max(insets.bottom, 34) }}
      >
        <Button
          label={t('settings.goodbye.close')}
          disabled={closing}
          onPress={() => void close()}
        />
      </View>
    </View>
  );
}
