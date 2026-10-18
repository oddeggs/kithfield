import type { FarmId } from '@kithfield/contracts';
import { LIMITS } from '@kithfield/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { NoticeCard } from '../../../ui/components/card';
import { Toggle } from '../../../ui/components/toggle';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useSettingsApi } from '../api/use-api';
import { notifySummary } from '../format';
import { go } from '../go';
import { useKitColors } from '../kit/colors';
import { Group, Label, NavBar, Page, Row } from '../kit/layout';
import { KText } from '../kit/text';
import { useRemote } from '../use-remote';
import { useFarmSettings } from './use-farm-settings';

const STILL_T = 1.2;

/** Farm settings: the farm, its people, and you on it. Keepers change the farm. */
export function FarmSettingsScreen({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const api = useSettingsApi();
  const { width } = useWindowDimensions();
  const { state, me, isKeeper, canInvite, write } = useFarmSettings(farm);
  const notify = useRemote(() => api.notifications(farm), farm);
  useFocusEffect(
    useCallback(() => {
      notify.reload();
    }, [notify.reload]),
  );
  const keepers = (state?.members ?? []).filter((m) => m.role === 'keeper');
  const others = keepers
    .filter((k) => k.person !== me?.person)
    .map((k) => k.name ?? t('settings.members.friend'));
  const keeperLine =
    me?.role !== 'keeper'
      ? others.join(', ')
      : others.length > 0
        ? t('settings.farm.keepersAnd', { names: others.join(', ') })
        : t('settings.farm.keepersYou');
  const season = state?.season.season ?? 'spring';
  const params = { farm };
  const summary = notify.data ? notifySummary(notify.data, Date.now()) : null;
  const notifyValue =
    summary === 'muted'
      ? t('settings.farm.notifyMuted')
      : summary === 'every'
        ? t('settings.farm.notifyEvery')
        : summary === 'gentle'
          ? t('settings.farm.notifyGentle')
          : '';

  return (
    <Page header={<NavBar title={t('settings.farm.title')} />}>
      <View style={{ height: 150, borderRadius: 24, overflow: 'hidden' }}>
        <ArtStill scene="strip" width={width - 32} height={150} attrs={{ season }} t={STILL_T} />
        {isKeeper ? (
          <Press
            onPress={() => go('/(tabs)/you/farm-land', params)}
            radius={16}
            accessibilityRole="button"
            accessibilityLabel={t('settings.farm.changeLand')}
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              height: 32,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor: kit.glass.fill,
              borderWidth: 1,
              borderColor: kit.glass.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArtIcon name="pencil" size={16} color={palette.text} />
            <KText kind="pill" style={{ fontSize: 13, lineHeight: 16 }}>
              {t('settings.farm.changeLand')}
            </KText>
          </Press>
        ) : null}
      </View>
      {state?.frozen ? <NoticeCard text={t('settings.farm.frozen')} /> : null}
      <Group>
        <Row
          title={t('settings.farm.name')}
          value={state?.name ?? ''}
          chevron={isKeeper}
          {...(isKeeper ? { onPress: () => go('/(tabs)/you/farm-name', params) } : {})}
        />
        <Row
          title={t('settings.farm.season')}
          subtitle={t('settings.farm.seasonSub')}
          value={t(`settings.season.${season}`)}
          chevron={isKeeper}
          {...(isKeeper ? { onPress: () => go('/(tabs)/you/farm-calendar', params) } : {})}
        />
        {isKeeper ? (
          <Row
            title={t('settings.farm.weather')}
            value={state?.place?.city ?? t('settings.farm.weatherNone')}
            onPress={() => go('/(tabs)/you/farm-weather', params)}
          />
        ) : null}
        <Row
          title={t('settings.farm.birthdays')}
          trailing={
            <Toggle
              value={state?.birthdaysBloom ?? false}
              onChange={(on) => void write('settings_changed', { setting: 'birthdays', on })}
              label={t('settings.farm.birthdays')}
              disabled={!isKeeper}
            />
          }
        />
      </Group>
      <Label text={t('settings.farm.people')} />
      <Group>
        <Row
          icon="people"
          title={t('settings.farm.critters')}
          subtitle={t('settings.farm.room', {
            count: state?.members.length ?? 0,
            max: LIMITS.members,
          })}
          onPress={() => go('/(tabs)/you/farm-members', params)}
        />
        {canInvite ? (
          <Row
            icon="link"
            title={t('settings.farm.invite')}
            subtitle={
              state?.approval ? t('settings.farm.inviteApproval') : t('settings.farm.inviteOpen')
            }
            onPress={() => go('/(tabs)/you/farm-invite', params)}
          />
        ) : null}
        <Row
          icon="key"
          title={t('settings.farm.keepers')}
          subtitle={keeperLine}
          onPress={() => go('/(tabs)/you/farm-members', params)}
        />
      </Group>
      <Label text={t('settings.farm.youHere')} />
      <Group>
        <Row
          icon="bell"
          title={t('settings.farm.notifications')}
          value={notifyValue}
          onPress={() => go('/(tabs)/you/farm-notifications', params)}
        />
        <Row
          icon="photo"
          title={t('settings.farm.media')}
          onPress={() => go('/(tabs)/chat/media', params)}
        />
        <Row
          icon="door"
          title={t('settings.farm.leave')}
          danger
          chevron={false}
          onPress={() => go('/(tabs)/farm/leave', { farm })}
        />
      </Group>
    </Page>
  );
}
