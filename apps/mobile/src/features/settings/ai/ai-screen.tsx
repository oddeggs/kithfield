import type { AiFeature, ConsentList } from '@kithfield/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '../../../ui/components/toast';
import { Toggle } from '../../../ui/components/toggle';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useSettingsApi } from '../api/use-api';
import { useDevicePref } from '../device-prefs';
import { go } from '../go';
import { useKitColors } from '../kit/colors';
import { BackButton, Group, Label, Pill, useDesignTop } from '../kit/layout';
import { SettingRow } from '../kit/setting-row';
import { KText } from '../kit/text';
import { openPage, siteUrl } from '../links';
import { useRemote } from '../use-remote';
import { AI_FEATURES, AI_PROVIDER, CONSENT_TEXT_VERSION } from './consent';

function Section({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Label text={label} settings />
      <Group settings>{children}</Group>
    </View>
  );
}

const allowedIn = (list: ConsentList | null, feature: AiFeature) =>
  list?.consents.find((c) => c.feature === feature)?.allowed ?? false;

/**
 * AI and your data: every switch, off until the person says yes. Turning an outside AI on
 * asks first; turning it off stops sending at once, and "Request deletion" asks
 * the provider and Kithfield to delete what was already sent.
 */
export function AiScreen() {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const api = useSettingsApi();
  const consents = useRemote(() =>
    AI_PROVIDER === null ? Promise.resolve({ consents: [] }) : api.consents(),
  );
  const [catchUp, setCatchUp] = useDevicePref('aiCatchUp');
  useFocusEffect(
    useCallback(() => {
      consents.reload();
    }, [consents.reload]),
  );

  const set = (feature: AiFeature, on: boolean) => {
    if (on) {
      go({ pathname: '/(modal)/settings-consent', params: { feature } });
      return;
    }
    const before = consents.data;
    consents.set((list) => ({
      consents: list.consents.map((c) => (c.feature === feature ? { ...c, allowed: false } : c)),
    }));
    api.setConsent(feature, { allowed: false, textVersion: CONSENT_TEXT_VERSION }).catch(() => {
      if (before) consents.set(() => before);
      toast.show(t('settings.failed'));
    });
  };
  const forget = () => {
    const asked = (consents.data?.consents ?? []).map((c) => c.feature);
    const features = asked.length > 0 ? asked : AI_FEATURES;
    Promise.all(features.map((f) => api.forgetConsent(f))).then(
      () => toast.show(t('settings.ai.forgotten')),
      () => toast.show(t('settings.failed')),
    );
  };
  // Without a provider nothing is sent out, so its section and the deletion request are left out.
  const provider = AI_PROVIDER ?? '';
  const captions = allowedIn(consents.data, 'captions');
  const recap = allowedIn(consents.data, 'recap');

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: top(118),
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingLeft: 4 }}>
          <Txt
            variant="displayL"
            multiline
            accessibilityRole="header"
            style={{ fontSize: 32, lineHeight: 35.2 }}
          >
            {t('settings.aiData')}
          </Txt>
          <KText
            kind="sheetBody"
            multiline
            color={palette.body}
            style={{ fontSize: 14, lineHeight: 20.3, marginTop: 6 }}
          >
            {t('settings.ai.lead')}
          </KText>
        </View>
        <Section label={t('settings.ai.onPhone')}>
          <SettingRow
            icon="sparkle"
            roomy
            title={t('settings.aiCatchUp')}
            subtitle={t('settings.ai.catchUpSub')}
            trailing={
              <Toggle
                value={catchUp === 'on'}
                onChange={(v) => setCatchUp(v ? 'on' : 'off')}
                label={t('settings.aiCatchUp')}
              />
            }
          />
        </Section>
        {AI_PROVIDER === null ? null : (
          <>
            <Section label={t('settings.ai.outside', { provider })}>
              <SettingRow
                icon="mic"
                roomy
                title={t('settings.ai.captions')}
                subtitle={captions ? t('settings.ai.captionsOn') : t('settings.ai.captionsOff')}
                trailing={
                  <Toggle
                    value={captions}
                    onChange={(v) => set('captions', v)}
                    label={t('settings.ai.captions')}
                    disabled={consents.data === null && !consents.failed}
                  />
                }
              />
              <SettingRow
                icon="envelope"
                roomy
                title={t('settings.ai.recap')}
                subtitle={recap ? t('settings.ai.recapOn') : t('settings.ai.recapOff')}
                trailing={
                  <Toggle
                    value={recap}
                    onChange={(v) => set('recap', v)}
                    label={t('settings.ai.recap')}
                    disabled={consents.data === null && !consents.failed}
                  />
                }
              />
            </Section>
            <View
              style={{
                borderRadius: 20,
                backgroundColor: palette.card,
                borderWidth: 1,
                borderColor: palette.hairline,
                padding: 14,
                gap: 10,
              }}
            >
              <KText kind="rowTitle" style={{ fontSize: 15, lineHeight: 18.8 }}>
                {t('settings.ai.takeBack')}
              </KText>
              <KText kind="card" multiline color={kit.body2} style={{ lineHeight: 18.9 }}>
                {t('settings.ai.takeBackText', { provider })}
              </KText>
              <Pill label={t('settings.ai.forget')} height={42} onPress={forget} />
            </View>
          </>
        )}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: 16,
            rowGap: 6,
            paddingLeft: 4,
          }}
        >
          {(
            [
              [t('settings.consent.privacy'), siteUrl('privacy', language)],
              [t('settings.ai.which'), siteUrl('privacy', language)],
            ] as const
          ).map(([label, url]) => (
            <Press
              key={label}
              onPress={() => openPage(url)}
              darken={false}
              hitSlop={10}
              accessibilityRole="link"
              accessibilityLabel={label}
            >
              <KText
                kind="pill"
                color={kit.link}
                style={{ fontSize: 13, lineHeight: 16.9, textDecorationLine: 'underline' }}
              >
                {label}
              </KText>
            </Press>
          ))}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', top: top(62), left: 20 }}>
        <BackButton />
      </View>
    </View>
  );
}
