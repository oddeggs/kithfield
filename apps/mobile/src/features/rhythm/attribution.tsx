import { KNOWN_WEATHER_SOURCES, type WeatherAttribution } from '@kithfield/contracts';
import { day } from '@kithfield/theme';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import type { ViewStyleProp } from '../../ui/style';
import { rhythmColours } from './colours';
import { useLoad, useRhythmApi } from './rhythm-api';

/** The provider's mark is shown this tall, never altered or recoloured. */
const MARK_H = 14;

function Mark({ uri, label }: { readonly uri: string; readonly label: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    Image.getSize(
      uri,
      (w, h) => live && h > 0 && setRatio(w / h),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [uri]);
  if (ratio === null) return null;
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={label}
      style={{ height: MARK_H, width: MARK_H * ratio }}
      resizeMode="contain"
    />
  );
}

/**
 * Where the weather came from, wherever it changes the farm: for WeatherKit, Apple's own mark and
 * its legal page, as the server caches them; for a source this app doesn't know, its name.
 */
export function WeatherAttributionRow({
  source,
  style,
}: {
  readonly source: string;
  readonly style?: ViewStyleProp;
}) {
  const { t, language } = useLocale();
  const { palette, appearance } = useTheme();
  const colours = rhythmColours(appearance);
  const api = useRhythmApi();
  const known = (KNOWN_WEATHER_SOURCES as readonly string[]).includes(source);
  const found = useLoad<WeatherAttribution | null>(
    known ? () => api.attribution(source, language) : null,
    [api, source, language, known],
  );
  const attribution = found.status === 'ready' ? found.value : null;
  const row = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colours.attribution,
    minHeight: 36,
  } as const;
  if (!known) {
    return (
      <View style={[row, style]}>
        <Txt variant="code" color={palette.body}>
          {t('rhythm.weather.plain', { source })}
        </Txt>
      </View>
    );
  }
  return (
    <View style={[row, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="code" color={palette.body}>
          {t('rhythm.weather.data')}
        </Txt>
        {attribution ? (
          <Mark
            uri={appearance === 'night' ? attribution.markDark : attribution.markLight}
            label={t('rhythm.weather.mark', { service: attribution.serviceName })}
          />
        ) : null}
      </View>
      {attribution ? (
        <Press
          onPress={() => void WebBrowser.openBrowserAsync(attribution.legalUrl)}
          darken={false}
          accessibilityRole="link"
          accessibilityLabel={t('rhythm.weather.sources')}
          hitSlop={12}
        >
          <Txt
            variant="code"
            color={appearance === 'night' ? palette.body : day.ink2}
            style={{ fontWeight: '600', textDecorationLine: 'underline' }}
          >
            {t('rhythm.weather.sources')}
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}
