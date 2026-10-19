import { APP_GROUP_PATHS, SurfaceData } from '@kithfield/contracts';
import type { StringKey } from '@kithfield/i18n';
import { ExtensionStorage } from '@bacons/apple-targets';
import { registerGlobals } from '@livekit/react-native';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { getNetworkStateAsync } from 'expo-network';
import * as Notifications from 'expo-notifications';
import { isAvailableAsync } from 'expo-task-manager';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import Purchases from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { surfaces } from '../../../modules/surfaces';
import { useDataClient } from '../../data';
import { androidSurfaceRoot } from '../android/surface-root';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';

/*
 * Development only: checks that each native module the depth features use is built into this
 * app, by calling it once. Nothing here is configured for real use: the features do that.
 */

type State = 'ready' | 'missing' | 'set' | 'unset' | 'on' | 'off' | 'checking';

const STATES = {
  ready: 'nativeLab.state.ready',
  missing: 'nativeLab.state.missing',
  set: 'nativeLab.state.set',
  unset: 'nativeLab.state.unset',
  on: 'nativeLab.state.on',
  off: 'nativeLab.state.off',
  checking: 'nativeLab.state.checking',
} as const satisfies Record<State, StringKey>;

interface Extra {
  readonly appGroup: string;
  readonly revenueCatIosKey?: string;
}

let globalsRegistered = false;

/** LiveKit's WebRTC globals, registered once per app run: `RTCPeerConnection` then exists. */
function callsState(): State {
  if (!globalsRegistered) {
    registerGlobals();
    globalsRegistered = true;
  }
  return typeof (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection === 'function'
    ? 'ready'
    : 'missing';
}

/** A check's answer: a `State`, or a value to show as it is. */
function useAsyncState(check: () => Promise<string>): string {
  const [state, setState] = useState<string>('checking');
  useEffect(() => {
    let live = true;
    check().then(
      (value) => live && setState(value),
      (error: unknown) => live && setState(String(error)),
    );
    return () => {
      live = false;
    };
  }, [check]);
  return state;
}

/** RevenueCat answers through its native module even before it is configured. */
const checkPurchases = (): Promise<State> =>
  Purchases.isConfigured().then(
    () => 'ready',
    () => 'missing',
  );

/** The connection's type as iOS reports it (`WIFI`, `CELLULAR`, `NONE`). */
const checkNetwork = async (): Promise<string> => String((await getNetworkStateAsync()).type);

const checkTasks = async (): Promise<State> => ((await isAvailableAsync()) ? 'ready' : 'missing');

export function NativeLab() {
  const { t } = useLocale();
  const client = useDataClient();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const extra = Constants.expoConfig?.extra as Extra;
  const [calls] = useState(callsState);
  const purchases = useAsyncState(checkPurchases);
  const network = useAsyncState(checkNetwork);
  const tasks = useAsyncState(checkTasks);
  const [note, setNote] = useState<string | null>(null);
  const appGroup: State = Paths.appleSharedContainers[extra.appGroup] ? 'ready' : 'missing';
  const activities: State =
    surfaces === null ? 'missing' : surfaces.activitiesEnabled() ? 'on' : 'off';
  const widgets = requireOptionalNativeModule('ExtensionStorage') !== null;
  const shown = (state: string) => (state in STATES ? t(STATES[state as State]) : state);
  const key: State = typeof extra.revenueCatIosKey === 'string' ? 'set' : 'unset';

  const rows = [
    t('nativeLab.calls', { state: shown(calls) }),
    t('nativeLab.purchases', { state: shown(purchases) }),
    t('nativeLab.purchasesKey', { state: shown(key) }),
    t('nativeLab.network', { state: shown(network) }),
    t('nativeLab.appGroup', { state: shown(appGroup) }),
    t('nativeLab.activities', { state: shown(activities) }),
    t('nativeLab.backgroundTasks', { state: shown(tasks) }),
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 16,
        gap: 22,
      }}
    >
      <Txt variant="displayM" accessibilityRole="header">
        {t('nativeLab.title')}
      </Txt>
      <Txt variant="caption" multiline color={palette.muted}>
        {t('nativeLab.subtitle')}
      </Txt>
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <Txt key={row} variant="rowTitle">
            {row}
          </Txt>
        ))}
      </View>
      <Button
        label={t('nativeLab.reloadWidgets')}
        kind="secondary"
        disabled={!widgets}
        onPress={() => {
          try {
            ExtensionStorage.reloadWidget();
            setNote(t('nativeLab.reloaded'));
          } catch (error) {
            setNote(t('nativeLab.failed', { error: String(error) }));
          }
        }}
      />
      {Platform.OS === 'android' ? (
        <Button
          label={t('nativeLab.samplePushes')}
          kind="secondary"
          onPress={() => {
            showSamplePushes(client, t)
              .then(() => setNote(t('nativeLab.samplePushesShown')))
              .catch((error: unknown) => setNote(t('nativeLab.failed', { error: String(error) })));
          }}
        />
      ) : null}
      {note ? (
        <Txt variant="note" multiline color={palette.muted}>
          {note}
        </Txt>
      ) : null}
    </ScrollView>
  );
}

/**
 * Who the samples are from: a friend on the farm as the surfaces last drew them, so the doorstep
 * sample shows as their message with their critter, as a server push with a sender does.
 */
function sampleSender(farm: string): { senderPerson: string; senderName: string } | null {
  try {
    const file = new File(androidSurfaceRoot(), APP_GROUP_PATHS.data);
    if (!file.exists) return null;
    const data = SurfaceData.parse(JSON.parse(file.textSync()));
    const friend = data.farms.find((f) => f.farm === farm)?.critters.find((c) => c.name !== null);
    return friend?.name ? { senderPerson: friend.person, senderName: friend.name } : null;
  } catch {
    return null;
  }
}

/**
 * Android: a plan push and a doorstep push on the first farm, in the channels and with the actions
 * FCM's data messages carry, so the notification shade can be seen without a server push.
 */
async function showSamplePushes(
  client: ReturnType<typeof useDataClient>,
  t: ReturnType<typeof useLocale>['t'],
) {
  const farm = (await client.api.farms()).farms.find((f) => f.kind === 'farm');
  if (farm === undefined) return;
  const title = farm.name ?? t('push.app');
  const at = Date.now();
  const sender = sampleSender(farm.farm);
  const samples = [
    {
      body: t('push.planDay.start', { title: t('gallery.type.sample.rowTitle') }),
      categoryIdentifier: 'plan',
      data: { farm: farm.farm, seq: 1, kind: 'seed_planted', push: `sample-plan-${at}`, seed: 1 },
    },
    {
      body: t('push.doorstep.firefly', { name: sender?.senderName ?? 'Otis' }),
      categoryIdentifier: 'tend',
      data: {
        farm: farm.farm,
        seq: 1,
        kind: 'firefly',
        push: `sample-step-${at}`,
        ...(sender ?? {}),
      },
    },
  ];
  for (const sample of samples) {
    await Notifications.scheduleNotificationAsync({
      content: { title, ...sample },
      trigger: { channelId: 'plans' },
    });
  }
}
