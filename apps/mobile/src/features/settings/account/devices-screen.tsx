import { motion } from '@kithfield/theme';
import type { DeviceList, Platform } from '@kithfield/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { isNotServed } from '../api/request';
import { useSettingsApi } from '../api/use-api';
import { agoOf } from '../format';
import { go } from '../go';
import { useKitColors } from '../kit/colors';
import { Badge, NavBar, Note, Page, Pill, Row } from '../kit/layout';
import { KText } from '../kit/text';
import { useRemote } from '../use-remote';

type Device = DeviceList['devices'][number];

const ICONS: Record<Platform, string> = {
  ios: 'more',
  android: 'more',
  macos: 'people',
  windows: 'people',
  web: 'share',
};

/**
 * Your signed-in devices: each with its kind, town and when it was last about. Signing
 * one out is instant and its row folds away; this phone signs out through a confirmation.
 */
export function DevicesScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const api = useSettingsApi();
  const devices = useRemote(() => api.devices());
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  useFocusEffect(
    useCallback(() => {
      devices.reload();
    }, [devices.reload]),
  );
  // Until the server lists devices, the screen says so and offers only this phone's sign-out.
  const unserved = isNotServed(devices.error);
  const list = (devices.data?.devices ?? [])
    .filter((d) => !gone.has(d.device))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt - a.lastActiveAt);

  const when = (d: Device) => {
    const ago = agoOf(d.lastActiveAt, Date.now());
    switch (ago.kind) {
      case 'now':
        return t('settings.devices.now');
      case 'today':
        return t('settings.devices.today');
      case 'days':
        return t('settings.devices.days', { count: ago.count });
      case 'months':
        return t('settings.devices.months', { count: ago.count });
    }
  };
  const meta = (d: Device) => {
    const platform = t(`settings.platform.${d.platform}`);
    return d.current && d.city
      ? t('settings.devices.metaPlace', { platform, place: d.city })
      : t('settings.devices.meta', { platform, when: when(d) });
  };
  const signOut = (d: Device) => {
    setGone((g) => new Set(g).add(d.device));
    api.signOutDevice(d.device).catch(() => {
      setGone((g) => {
        const next = new Set(g);
        next.delete(d.device);
        return next;
      });
      toast.show(t('settings.failed'));
    });
  };

  return (
    <Page header={<NavBar title={t('settings.devices')} />} inset={20} gap={12}>
      {list.length > 0 ? (
        <View
          style={{
            borderRadius: 22,
            backgroundColor: palette.card,
            paddingVertical: 2,
            paddingHorizontal: 14,
          }}
        >
          {list.map((d, i) => (
            <Animated.View
              key={d.device}
              layout={LinearTransition.duration(motion.fade.durationMs)}
              exiting={FadeOut.duration(motion.fade.durationMs)}
              style={i === 0 ? null : { borderTopWidth: 1, borderTopColor: palette.hairline }}
            >
              <Row
                small
                icon={ICONS[d.platform]}
                title={d.name}
                subtitle={meta(d)}
                {...(d.current
                  ? { badge: <Badge text={t('settings.devices.thisPhone')} tone="helper" /> }
                  : {})}
                {...(d.current
                  ? {}
                  : {
                      trailing: (
                        <Press
                          onPress={() => signOut(d)}
                          darken={false}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('settings.devices.signOut')}, ${d.name}`}
                        >
                          <KText
                            kind="pill"
                            color={kit.danger}
                            style={{ fontSize: 14, lineHeight: 17 }}
                          >
                            {t('settings.devices.signOut')}
                          </KText>
                        </Press>
                      ),
                    })}
              />
            </Animated.View>
          ))}
        </View>
      ) : null}
      {unserved ? (
        <Note text={t('settings.devices.unavailable')} />
      ) : (
        <>
          <Pill
            label={t('settings.devices.link')}
            icon="plus"
            height={56}
            onPress={() => go('/(cover)/settings-link')}
          />
          <Note text={t('settings.devices.note')} />
        </>
      )}
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
          icon="door"
          title={t('settings.devices.signOutHere')}
          danger
          chevron={false}
          onPress={() => go('/(modal)/settings-sign-out')}
        />
      </View>
    </Page>
  );
}
