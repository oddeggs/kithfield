import type { FarmId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarmLink, useOpenFarm } from '../../../data';
import { ArtStill } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { useLocale } from '../../../ui/locale/locale-provider';
import { easings } from '../../../ui/motion/motion';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useSettingsApi } from '../api/use-api';
import { seasonHere } from '../format';
import { useKitColors } from '../kit/colors';
import { useDesignTop } from '../kit/layout';
import { KText } from '../kit/text';
import { usePhoneZone } from '../time-zone';
import { useRemote } from '../use-remote';

/** One sweep of the arriving bar: the design's reveal pace. */
const SWEEP_MS = 1600;

/** Opens one farm's socket until it has caught up, then says so. */
function Catcher({
  farm,
  onLive,
}: {
  readonly farm: FarmId;
  readonly onLive: (farm: FarmId) => void;
}) {
  useOpenFarm(farm);
  const link = useFarmLink(farm);
  useEffect(() => {
    if (link.status === 'live') onLive(farm);
  }, [link.status, farm, onLive]);
  return null;
}

function Bar({ label, here }: { readonly label: string; readonly here: boolean }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (here || reduce) return;
    sweep.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: easings.reveal }), -1, false));
  }, [here, reduce, sweep]);
  const fill = useAnimatedStyle(() => ({
    width: width * 0.35,
    transform: [{ translateX: (sweep.get() * 1.35 - 0.35) * width }],
  }));
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <KText kind="rowTitle" style={{ fontSize: 14, lineHeight: 16.8 }}>
          {label}
        </KText>
        <KText
          kind="pill"
          medium
          color={here ? kit.link : palette.secondary}
          style={{ fontSize: 14, lineHeight: 16.8, fontWeight: '500' }}
        >
          {here ? t('settings.arriving.here') : t('settings.arriving.coming')}
        </KText>
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: palette.hairline,
          overflow: 'hidden',
        }}
      >
        {here ? (
          <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.go.bg }} />
        ) : (
          <Animated.View
            style={[{ height: 6, borderRadius: 3, backgroundColor: palette.honey }, fill]}
          />
        )}
      </View>
    </View>
  );
}

/**
 * History arriving on a new phone: each farm, then the visits, catch up one at a time
 * over their own sockets; the person can go to the farm at once and the rest keeps arriving.
 */
export function ArrivingScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const api = useSettingsApi();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const zone = usePhoneZone();
  const { width } = useWindowDimensions();
  const me = useRemote(() => api.me());
  const list = useRemote(() => api.farms());
  const [live, setLive] = useState<ReadonlySet<FarmId>>(new Set());
  const farms = useMemo(() => list.data?.farms ?? [], [list.data]);
  const next = farms.find((f) => !live.has(f.farm))?.farm ?? null;
  const markLive = useMemo(() => (farm: FarmId) => setLive((s) => new Set(s).add(farm)), []);
  const visits = farms.filter((f) => f.kind === 'visit');

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {next ? <Catcher farm={next} onLive={markLive} /> : null}
      <ArtStill
        scene="slowpost"
        width={width}
        height={520}
        attrs={{ season: seasonHere(zone, Date.now()) }}
        t={1.2}
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
          paddingHorizontal: 20,
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
        <ScrollView contentContainerStyle={{ gap: 12, paddingTop: 12, paddingBottom: 110 }}>
          <Txt variant="handS" color={kit.link} style={{ fontSize: 17, lineHeight: 18.7 }}>
            {t('settings.arriving.eyebrow')}
          </Txt>
          <Txt variant="displayM" multiline accessibilityRole="header" style={{ lineHeight: 29.1 }}>
            {t('settings.arriving.title')}
          </Txt>
          <KText kind="sheetBody" multiline color={palette.body}>
            {t('settings.arriving.body', { name: me.data?.name ?? '' })}
          </KText>
          <View style={{ gap: 10 }}>
            {farms
              .filter((f) => f.kind === 'farm')
              .map((f) => (
                <Bar key={f.farm} label={f.name ?? ''} here={live.has(f.farm)} />
              ))}
            {visits.length > 0 ? (
              <Bar
                label={t('settings.arriving.visits')}
                here={visits.every((v) => live.has(v.farm))}
              />
            ) : null}
          </View>
        </ScrollView>
        <View
          style={{ position: 'absolute', left: 20, right: 20, bottom: Math.max(insets.bottom, 34) }}
        >
          <Button
            label={t('settings.arriving.go')}
            onPress={() => {
              router.dismissAll();
              router.navigate('/(tabs)/farm');
            }}
          />
        </View>
      </View>
    </View>
  );
}
