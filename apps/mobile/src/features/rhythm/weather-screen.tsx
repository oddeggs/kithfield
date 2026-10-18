import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { farm as farmTheme } from '@kithfield/theme';
import { router } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useFarmEvents, useFarmView, useOpenFarm } from '../../data';
import { LayeredScene } from '../../ui/art/layered-scene';
import { ArtIcon } from '../../ui/art/art-view';
import { Glass } from '../../ui/components/glass';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { NightVeil, Panel } from '../farm/panel';
import { typeAt } from '../farm/type-at';
import { useNow } from '../farm/use-now';
import { WeatherAttributionRow } from './attribution';
import { rhythmColours } from './colours';
import { say } from './copy';
import { todayWeather, type RealWeather, type TodayWeather } from './moments';

const W = 393;

/** The weather chip's icon for each kind of weather. */
export const WEATHER_ICON: Record<RealWeather, string> = {
  rain: 'raincloud',
  frost: 'sparkle',
  heat: 'sun',
};

/** "Rain · Hollow Creek": what's falling on the farm today, from the keeper's town. */
export function WeatherChip({
  weather,
  onPress,
}: {
  readonly weather: TodayWeather;
  readonly onPress?: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const label = say(t, `rhythm.weather.${weather.weather}`);
  const chip = (
    <Glass
      radius={18}
      fill={palette.glassButton.fill}
      border={palette.glassButton.border}
      style={{
        height: 36,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <ArtIcon name={WEATHER_ICON[weather.weather]} size={20} color={palette.text} />
      <Txt variant="buttonSmall" color={palette.text} style={{ fontSize: 13, lineHeight: 13 }}>
        {t('rhythm.weather.chip', { weather: label, city: weather.city })}
      </Txt>
    </Glass>
  );
  if (!onPress) return chip;
  return (
    <Press
      onPress={onPress}
      radius={18}
      accessibilityRole="button"
      accessibilityLabel={t('rhythm.weather.chipLabel', { weather: label, city: weather.city })}
    >
      {chip}
    </Press>
  );
}

/**
 * Real weather on the farm: the farm follows the keeper's town, and the weather's provider is
 * credited with its own mark and legal page.
 */
export function WeatherScreen({ farm }: { readonly farm: FarmId }) {
  const { t, fontLocale } = useLocale();
  const { palette, appearance } = useTheme();
  const colours = rhythmColours(appearance);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const now = useNow();
  useOpenFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const events = useFarmEvents(farm, 100);
  const weather = state && view ? todayWeather(state, view, events) : null;
  const kind = weather?.weather ?? 'rain';
  const city = weather?.city ?? state?.place?.city ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', top: 0, left: 0 }}>
        <LayeredScene
          scene="farm"
          width={width}
          height={560 * k}
          attrs={{ season: state?.season.season ?? 'spring', rain: kind === 'rain' }}
          tolerance={8}
        />
        <NightVeil width={width} height={560 * k} />
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 1,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <Press
          onPress={() => router.back()}
          radius={22}
          accessibilityRole="button"
          accessibilityLabel={t('rhythm.backToFarm')}
          style={{ flexShrink: 1, minWidth: 0 }}
        >
          <Glass
            radius={22}
            fill={palette.glassButton.fill}
            border={palette.glassButton.border}
            shadow={farmTheme.shadows.glassPill}
            style={{ height: 44, paddingHorizontal: 14, justifyContent: 'center' }}
          >
            <Txt
              variant="displayS"
              color={palette.text}
              numberOfLines={1}
              style={{ flexShrink: 0 }}
            >
              {state?.name ?? ''}
            </Txt>
          </Glass>
        </Press>
        {weather ? <WeatherChip weather={weather} /> : null}
      </View>
      <Panel top={520 * k} style={{ paddingHorizontal: 22, paddingTop: 12 }}>
        <Txt
          variant="handL"
          color={colours.gateChip.fg}
          style={typeAt('handL', 17, 17, fontLocale)}
        >
          {say(t, `rhythm.weather.${kind}.eyebrow`)}
        </Txt>
        <Txt
          variant="displayM"
          multiline
          accessibilityRole="header"
          style={typeAt('displayM', 24, 26.9, fontLocale)}
        >
          {say(t, `rhythm.weather.${kind}.title`, { city })}
        </Txt>
        <Txt
          variant="sheetBody"
          multiline
          color={palette.body}
          style={{ fontSize: 14.5, lineHeight: 21 }}
        >
          {say(t, `rhythm.weather.${kind}.body`)}
        </Txt>
        <View style={{ flex: 1 }} />
        <WeatherAttributionRow
          source={weather?.source ?? 'weatherkit'}
          style={{ marginBottom: 34 }}
        />
      </Panel>
    </View>
  );
}
