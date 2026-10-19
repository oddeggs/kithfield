import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toggle } from '../../../ui/components/toggle';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { stickerRoutes } from '../../stickers/routes';
import { aiDataCount } from '../ai/consent';
import { useSettingsApi } from '../api/use-api';
import { useDevicePref } from '../device-prefs';
import { HOUSE_HOURS, clockTime, zoneName } from '../format';
import { go } from '../go';
import { BackButton, Group, Label, useDesignTop } from '../kit/layout';
import { SettingRow } from '../kit/setting-row';
import { useRemote } from '../use-remote';
import { LoadFailed } from '../kit/remote-state';
import { useMeSettings } from './use-me-settings';

function Section({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Label text={label} settings />
      <Group settings>{children}</Group>
    </View>
  );
}

/**
 * Settings: privacy, catching up, nudges and farms as designed; below them your hours,
 * language and the account, built from the same rows (logged as undesigned).
 */
export function SettingsScreen() {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const api = useSettingsApi();
  const { me, settings, change } = useMeSettings();
  const [catchUp, setCatchUp] = useDevicePref('aiCatchUp');
  const consents = useRemote(() => api.consents());
  const catchUpOn = catchUp === 'on';
  // Counted once the answers are in, so the row never shows everything off while they load.
  const aiCount = consents.data === null ? null : aiDataCount(catchUpOn, consents.data.consents);

  const quiet = settings?.quietHours ?? null;
  const quietValue = quiet
    ? t('settings.quietHours.range', {
        from: clockTime(quiet.from, language),
        to: clockTime(quiet.to, language),
      })
    : t('settings.quietHours.range', {
        from: clockTime(HOUSE_HOURS.from, language),
        to: clockTime(HOUSE_HOURS.to, language),
      });

  const toggle = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Toggle value={value} onChange={onChange} label={label} disabled={settings === null} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: top(114),
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Txt
          variant="displayL"
          accessibilityRole="header"
          style={{ paddingLeft: 4, lineHeight: 37.4 }}
        >
          {t('settings.title')}
        </Txt>
        {/* Your settings couldn't be read: say so over the rows, which wait switched off. */}
        {me.data === null && me.failed ? <LoadFailed onRetry={me.reload} /> : null}
        <Section label={t('settings.privacy')}>
          <SettingRow
            icon="lock"
            title={t('settings.whoSees')}
            value={t('settings.whoSees.value')}
          />
          <SettingRow
            icon="lantern"
            title={t('settings.lightWindow')}
            trailing={toggle(
              settings?.lightWindow ?? false,
              (v) => change({ lightWindow: v }),
              t('settings.lightWindow'),
            )}
          />
          <SettingRow
            icon="dewdrop"
            title={t('settings.readReceipts')}
            subtitle={t('settings.readReceipts.sub')}
            value={t('settings.readReceipts.value')}
          />
        </Section>
        <Section label={t('settings.catchingUp')}>
          <SettingRow
            icon="sparkle"
            roomy
            title={t('settings.aiCatchUp')}
            subtitle={catchUpOn ? t('settings.aiCatchUp.on') : t('settings.aiCatchUp.off')}
            trailing={
              <Toggle
                value={catchUpOn}
                onChange={(v) => setCatchUp(v ? 'on' : 'off')}
                label={t('settings.aiCatchUp')}
              />
            }
          />
          <SettingRow
            indent
            title={t('settings.aiData')}
            {...(aiCount ? { value: t('settings.aiData.value', aiCount) } : {})}
            onPress={() => go('/(tabs)/you/ai')}
          />
        </Section>
        <Section label={t('settings.nudges')}>
          <SettingRow
            icon="bell"
            title={t('settings.nudges.title')}
            value={settings ? t(`settings.nudges.${settings.nudges}`) : ''}
            onPress={() => go({ pathname: '/(tabs)/you/choose', params: { setting: 'nudges' } })}
          />
          <SettingRow
            icon="moon"
            title={t('settings.backOff')}
            trailing={toggle(
              settings?.backOffWhenQuiet ?? false,
              (v) => change({ backOffWhenQuiet: v }),
              t('settings.backOff'),
            )}
          />
        </Section>
        <Section label={t('settings.farms')}>
          <SettingRow
            icon="leaf"
            title={t('settings.leaveFarm')}
            subtitle={t('settings.leaveFarm.sub')}
            value={t('settings.leaveFarm.value')}
            onPress={() => go('/(tabs)/you/farms')}
          />
        </Section>
        <Section label={t('settings.yourHours')}>
          <SettingRow
            icon="clock"
            title={t('settings.quietHours')}
            subtitle={
              settings ? t('settings.quietHours.sub', { zone: zoneName(settings.timeZone) }) : ''
            }
            value={quietValue}
            onPress={() =>
              go({ pathname: '/(tabs)/you/choose', params: { setting: 'quietHours' } })
            }
          />
          <SettingRow
            icon="people"
            title={t('settings.stickers')}
            subtitle={t('settings.stickers.sub')}
            trailing={toggle(
              settings?.inTogetherStickers ?? true,
              (v) => change({ inTogetherStickers: v }),
              t('settings.stickers'),
            )}
          />
          <SettingRow
            icon="people"
            title={t('settings.stickers.asks')}
            subtitle={t('settings.stickers.asksSub')}
            onPress={() => go(stickerRoutes.asks())}
          />
          <SettingRow
            icon="sparkle"
            title={t('settings.stickers.export')}
            subtitle={t('settings.stickers.exportSub')}
            onPress={() => go(stickerRoutes.export())}
          />
          <SettingRow
            icon="chat"
            title={t('settings.language')}
            value={t(`settings.language.${settings?.lang ?? language}`)}
            onPress={() => go({ pathname: '/(tabs)/you/choose', params: { setting: 'language' } })}
          />
        </Section>
        <Section label={t('settings.account')}>
          <SettingRow
            icon="key"
            title={t('settings.devices')}
            onPress={() => go('/(tabs)/you/devices')}
          />
          <SettingRow
            icon="block"
            title={t('settings.blocked')}
            onPress={() => go('/(tabs)/you/blocked')}
          />
          <SettingRow
            icon="note"
            title={t('settings.safetyNotes')}
            onPress={() => go('/(tabs)/you/safety-notes')}
          />
          <SettingRow
            icon="heart"
            title={t('settings.about')}
            onPress={() => go('/(tabs)/you/about')}
          />
          <SettingRow
            icon="trash"
            danger
            title={t('settings.delete')}
            onPress={() => go('/(cover)/settings-delete')}
          />
        </Section>
      </ScrollView>
      <View style={{ position: 'absolute', top: top(62), left: 20 }}>
        <BackButton glass />
      </View>
    </View>
  );
}
