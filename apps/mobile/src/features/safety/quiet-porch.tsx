import { router } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { useSettingsApi } from '../settings/api/use-api';
import { BackButton, useDesignTop } from '../settings/kit/layout';
import { KText } from '../settings/kit/text';
import { useRemote } from '../settings/use-remote';

/**
 * A porch that isn't taking visits, as someone blocked sees it: the same as any quiet
 * friend. Nothing here, or anywhere, says blocked.
 */
export function QuietPorch({ name, species }: { readonly name: string; readonly species: string }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const { width } = useWindowDimensions();
  const api = useSettingsApi();
  const me = useRemote(() => api.me());
  const mine = me.data?.critter?.species ?? '';
  const cast = [`${species || 'rabbit'}/////z`, ...(mine ? [`${mine}/////`] : [])].join(',');
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ArtStill
        scene="porch"
        width={width}
        height={430}
        attrs={{ cast }}
        t={1.2}
        style={{ opacity: 0.9 }}
      />
      <View
        style={{
          position: 'absolute',
          top: top(400),
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: palette.sheet,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          boxShadow: palette.sheetShadow,
          paddingTop: 10,
          paddingHorizontal: 18,
          gap: 12,
        }}
      >
        <View
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            backgroundColor: palette.grabber,
            alignSelf: 'center',
          }}
        />
        <Txt variant="handS" color={palette.secondary} style={{ fontSize: 17, lineHeight: 18.7 }}>
          {t('safety.porch.eyebrow')}
        </Txt>
        <Txt
          variant="displayM"
          multiline
          accessibilityRole="header"
          style={{ fontSize: 28, lineHeight: 30.8 }}
        >
          {t('safety.porch.title', { name })}
        </Txt>
        <KText kind="sheetBody" multiline color={palette.body}>
          {t('safety.porch.body', { name })}
        </KText>
        <View
          style={{ position: 'absolute', left: 18, right: 18, bottom: Math.max(insets.bottom, 34) }}
        >
          <Button
            label={t('safety.porch.back')}
            kind="secondary"
            onPress={() => {
              router.dismissAll();
              router.navigate('/(tabs)/farm');
            }}
          />
        </View>
      </View>
      <View style={{ position: 'absolute', top: top(58), left: 16 }}>
        <BackButton glass />
      </View>
    </View>
  );
}
