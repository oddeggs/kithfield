import { FarmName, FarmPlace, type FarmId, type Hemisphere } from '@kithfield/contracts';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { TextField } from '../../../ui/components/text-field';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { zoneName } from '../format';
import { Group, NavBar, Note, Page, Pill, Row } from '../kit/layout';
import { KText } from '../kit/text';
import { usePhoneZone } from '../time-zone';
import { LANDS } from './lands';
import { useFarmSettings } from './use-farm-settings';

/* The keeper's edits behind farm settings' rows. No design draws them; they are logged as undesigned. */

/** Renames the farm: the farm writes `settings_changed {name}`. */
export function FarmNameScreen({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { state, write } = useFarmSettings(farm);
  const [name, setName] = useState('');
  useEffect(() => {
    if (state?.name) setName((n) => n || (state.name ?? ''));
  }, [state?.name]);
  const valid = FarmName.safeParse(name.trim()).success && name.trim() !== state?.name;
  const save = async () => {
    if (await write('settings_changed', { setting: 'name', name: name.trim() })) router.back();
  };
  return (
    <Page header={<NavBar title={t('settings.farm.rename')} />}>
      <TextField
        label={t('settings.farm.name')}
        value={name}
        onChangeText={setName}
        maxLength={32}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => valid && void save()}
      />
      <Pill
        label={t('settings.farm.renameSave')}
        kind="ink"
        disabled={!valid}
        onPress={() => void save()}
      />
    </Page>
  );
}

/** The farm's calendar: which half of the world, and the time zone its days turn over in. */
export function FarmCalendarScreen({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { state, write } = useFarmSettings(farm);
  const phoneZone = usePhoneZone();
  const zone = state?.timeZone ?? phoneZone;
  const set = (hemisphere: Hemisphere, timeZone: string) =>
    void write('settings_changed', { setting: 'calendar', hemisphere, timeZone });
  return (
    <Page header={<NavBar title={t('settings.calendar.title')} />}>
      <Group>
        {(['north', 'south'] as const).map((h) => (
          <Row
            key={h}
            title={t(`settings.calendar.${h}`)}
            selected={state?.hemisphere === h}
            onPress={() => state && state.hemisphere !== h && set(h, zone)}
          />
        ))}
      </Group>
      <Group>
        <Row title={t('settings.calendar.zone', { zone: zoneName(zone) })} />
        {phoneZone !== zone ? (
          <Row
            title={t('settings.calendar.useHere')}
            subtitle={zoneName(phoneZone)}
            onPress={() => state && set(state.hemisphere, phoneZone)}
          />
        ) : null}
      </Group>
      <Note text={t('settings.calendar.note')} />
    </Page>
  );
}

/** The town the farm's weather comes from: a city, never anyone's location. */
export function FarmWeatherScreen({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const toast = useToast();
  const { state, write } = useFarmSettings(farm);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const find = async () => {
    const q = query.trim();
    if (q === '') return;
    setBusy(true);
    try {
      const [hit] = await Location.geocodeAsync(q);
      const [named] = hit
        ? await Location.reverseGeocodeAsync({ latitude: hit.latitude, longitude: hit.longitude })
        : [];
      const place = FarmPlace.safeParse({
        city: named?.city ?? named?.subregion ?? q,
        country: named?.isoCountryCode ?? '',
        lat: hit?.latitude,
        lng: hit?.longitude,
      });
      if (!place.success) {
        toast.show(t('settings.weather.notFound'));
        return;
      }
      if (await write('settings_changed', { setting: 'place', place: place.data })) router.back();
    } catch {
      toast.show(t('settings.weather.notFound'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page header={<NavBar title={t('settings.weather.title')} />}>
      {state?.place ? (
        <Group>
          <Row title={state.place.city} subtitle={state.place.country} />
          <Row
            title={t('settings.weather.clear')}
            danger
            chevron={false}
            onPress={() => void write('settings_changed', { setting: 'place', place: null })}
          />
        </Group>
      ) : null}
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('settings.weather.placeholder')}
        accessibilityLabel={t('settings.weather.placeholder')}
        returnKeyType="search"
        onSubmitEditing={() => void find()}
        autoCorrect={false}
      />
      <Pill
        label={t('settings.weather.find')}
        kind="ink"
        disabled={busy || query.trim() === ''}
        onPress={() => void find()}
      />
      <Note text={t('settings.weather.note')} />
    </Page>
  );
}

/** The farm's land: one of the four a new farm chooses from. */
export function FarmLandScreen({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const { state, write } = useFarmSettings(farm);
  const tile = (width - 32 - 12) / 2;
  return (
    <Page header={<NavBar title={t('settings.land.title')} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {LANDS.map((land) => {
          const on = state?.land === land.id;
          return (
            <Press
              key={land.id}
              onPress={() => {
                if (on) return;
                haptics.select();
                void write('settings_changed', { setting: 'land', land: land.id });
              }}
              radius={20}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(land.label)}
              style={{ width: tile, alignItems: 'center', gap: 6 }}
            >
              <View
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
                  boxShadow: on
                    ? `0 0 0 2.5px ${palette.background}, 0 0 0 4.5px ${palette.text}`
                    : `0 0 0 1px ${palette.hairline}`,
                }}
              >
                <ArtStill
                  scene="strip"
                  width={tile}
                  height={tile * 0.7}
                  attrs={{ season: land.season }}
                  t={1.2}
                />
              </View>
              <KText kind="pill" style={{ fontSize: 12.5, lineHeight: 15 }}>
                {t(land.label)}
              </KText>
            </Press>
          );
        })}
      </View>
    </Page>
  );
}
