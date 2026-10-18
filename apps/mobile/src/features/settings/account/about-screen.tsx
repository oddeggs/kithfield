import Constants from 'expo-constants';
import { View } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { NavBar, Page, Row } from '../kit/layout';
import { KText } from '../kit/text';
import { SAFETY_EMAIL, WEATHER_SOURCES_URL, openPage, siteUrl } from '../links';

/** About Kithfield: the house rules, the privacy promise, help, and the weather's source. */
export function AboutScreen() {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const version = Constants.expoConfig?.version ?? '';
  const build =
    Constants.expoConfig?.ios?.buildNumber ?? String(Constants.nativeBuildVersion ?? '');
  return (
    <Page header={<NavBar title={t('settings.about')} />} inset={20} gap={12}>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
        <View style={{ width: 84, height: 84, borderRadius: 20, overflow: 'hidden' }}>
          <ArtStill scene="appicon" width={84} height={84} />
        </View>
        <Txt variant="sheetTitle" style={{ lineHeight: 22 }}>
          {t('shell.appName')}
        </Txt>
        <KText kind="settingSub" color={palette.secondary}>
          {t('settings.about.version', { version, build })}
        </KText>
      </View>
      <View
        style={{
          borderRadius: 22,
          backgroundColor: palette.card,
          paddingVertical: 2,
          paddingHorizontal: 14,
        }}
      >
        <Row
          small
          icon="heart"
          title={t('settings.about.rules')}
          subtitle={t('settings.about.rulesSub')}
          onPress={() => openPage(siteUrl('terms', language))}
        />
        <View style={{ height: 1, backgroundColor: palette.hairline }} />
        <Row
          small
          icon="lock"
          title={t('settings.about.privacy')}
          subtitle={t('settings.about.privacySub')}
          onPress={() => openPage(siteUrl('privacy', language))}
        />
        <View style={{ height: 1, backgroundColor: palette.hairline }} />
        <Row
          small
          icon="note"
          title={t('settings.about.help')}
          subtitle={t('settings.about.helpSub', { email: SAFETY_EMAIL })}
          onPress={() => openPage(siteUrl('contact', language))}
        />
        <View style={{ height: 1, backgroundColor: palette.hairline }} />
        <Row
          small
          icon="leaf"
          title={t('settings.about.thanks')}
          onPress={() => openPage(siteUrl('acknowledgements', language))}
        />
        <View style={{ height: 1, backgroundColor: palette.hairline }} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14,
            paddingHorizontal: 14,
          }}
        >
          <KText kind="value" color={palette.body}>
            {t('settings.about.weather')}{' '}
            <KText kind="value" style={{ fontWeight: '600' }}>
              {t('settings.about.weatherName')}
            </KText>
          </KText>
          <Press
            onPress={() => openPage(WEATHER_SOURCES_URL)}
            darken={false}
            hitSlop={12}
            accessibilityRole="link"
            accessibilityLabel={t('settings.about.sources')}
          >
            <KText kind="value" style={{ fontWeight: '600', textDecorationLine: 'underline' }}>
              {t('settings.about.sources')}
            </KText>
          </Press>
        </View>
      </View>
    </Page>
  );
}
