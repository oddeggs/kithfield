import type { ExportStatus } from '@kithfield/contracts';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { ApiError } from '../api/request';
import { useSettingsApi } from '../api/use-api';
import { seasonHere } from '../format';
import { confirmIdentity } from '../identity';
import { useRemote } from '../use-remote';
import { markDeleted } from './deletion';
import { NavBar, Row, useDesignTop } from '../kit/layout';
import { KText } from '../kit/text';
import { usePhoneZone } from '../time-zone';
import { swap } from '../go';

/** How often a keepsakes zip being packed is asked about while the screen is open. */
const EXPORT_POLL_MS = 5000;

function useFaceId(): boolean {
  const [face, setFace] = useState(true);
  useEffect(() => {
    void Promise.all([
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]).then(([types, enrolled]) =>
      setFace(
        enrolled && types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION),
      ),
    );
  }, []);
  return face;
}

/**
 * Deleting your account: what goes and what stays, keepsakes first, then Face ID or the
 * passcode. The server starts the 30-day wait and ends every session; signing in again cancels.
 */
export function DeleteAccountScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const api = useSettingsApi();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const zone = usePhoneZone();
  const face = useFaceId();
  const [exp, setExp] = useState<ExportStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useRemote(() => api.me());
  const anonymous = me.data !== null && me.data.signIn.length === 0;

  useEffect(() => {
    let live = true;
    api.exportStatus().then(
      (s) => live && setExp(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api]);
  const preparing = exp?.state === 'preparing';
  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => {
      api.exportStatus().then(setExp, () => undefined);
    }, EXPORT_POLL_MS);
    return () => clearInterval(timer);
  }, [api, preparing]);

  const keepsakes = () => {
    if (exp?.state === 'ready' && exp.url) {
      void WebBrowser.openBrowserAsync(exp.url);
      return;
    }
    api.startExport().then(
      (s) => {
        setExp(s);
        if (s.state === 'ready' && s.url) void WebBrowser.openBrowserAsync(s.url);
      },
      () => toast.show(t('settings.failed')),
    );
  };

  const remove = async () => {
    setBusy(true);
    try {
      if (!(await confirmIdentity(t('settings.delete.prompt')))) return;
      const person = me.data ?? (await api.me().catch(() => null));
      await api.deleteAccount();
      haptics.success();
      markDeleted({
        name: person?.name ?? '',
        species: person?.critter?.species ?? '',
        anonymous: person !== null && person.signIn.length === 0,
      });
      swap('/(cover)/settings-goodbye');
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) toast.show(t('settings.failed'));
    } finally {
      setBusy(false);
    }
  };

  const items = [
    ['trash', 'settings.delete.critter'],
    ['door', 'settings.delete.cottages'],
    ['lock', 'settings.delete.purchases'],
    ['clock', anonymous ? 'settings.delete.waitAnonymous' : 'settings.delete.wait'],
  ] as const;
  const exportLine = preparing
    ? t('settings.delete.preparing')
    : exp?.state === 'ready'
      ? t('settings.delete.ready')
      : t('settings.delete.keepsakesSub');

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: top(104), paddingBottom: 200 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingLeft: 46 }}>
          <ArtStill
            scene="spot"
            width={300}
            height={170}
            attrs={{ name: 'left', season: seasonHere(zone, Date.now()) }}
          />
        </View>
        <View style={{ marginTop: 16, paddingHorizontal: 16, gap: 10 }}>
          <Txt variant="displayM" multiline accessibilityRole="header" style={{ lineHeight: 28.6 }}>
            {t('settings.delete.title')}
          </Txt>
          {items.map(([icon, key]) => (
            <View key={key} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <ArtIcon name={icon} size={22} color={palette.secondary} style={{ marginTop: 1 }} />
              <KText
                kind="listItem"
                multiline
                color={palette.body}
                style={{ flex: 1, fontSize: 15, lineHeight: 21 }}
              >
                {t(key)}
              </KText>
            </View>
          ))}
          <Row
            icon="share"
            title={t('settings.delete.keepsakes')}
            subtitle={exportLine}
            chevron={false}
            onPress={keepsakes}
          />
        </View>
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: Math.max(insets.bottom, 34),
          gap: 6,
        }}
      >
        <KText kind="note" align="center" color={palette.secondary}>
          {face ? t('settings.delete.faceId') : t('settings.delete.passcode')}
        </KText>
        <Button
          label={t('settings.delete.confirm')}
          kind="destructive"
          disabled={busy}
          onPress={() => void remove()}
        />
        <Button label={t('settings.delete.keep')} kind="text" onPress={() => router.back()} />
      </View>
      <NavBar title={t('settings.delete')} />
    </View>
  );
}
