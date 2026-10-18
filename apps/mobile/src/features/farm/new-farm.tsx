import { LIMITS } from '@kithfield/contracts';
import { radii } from '@kithfield/theme';
import { getCalendars, getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../data';
import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { TextField } from '../../ui/components/text-field';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { sheetTo } from '../../ui/motion/motion';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { deviceTimeZone, hemisphereOf } from './calendar';
import { backToFarm } from './routes';
import { useValley } from './valley-store';

/** The four lands and the season strip each one's palette is drawn from. */
export const LANDS = [
  { id: 'meadow', strip: 'spring' },
  { id: 'orchard', strip: 'summer' },
  { id: 'hollow', strip: 'autumn' },
  { id: 'hilltop', strip: 'winter' },
] as const;
type Land = (typeof LANDS)[number]['id'];

/** A farm's name: 1 to 32 characters once trimmed. */
export const validFarmName = (name: string) =>
  name.trim().length >= 1 && name.trim().length <= LIMITS.farmName;

function LandTile({
  land,
  strip,
  label,
  on,
  onPress,
}: {
  readonly land: Land;
  readonly strip: string;
  readonly label: string;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  // The chosen land's tile grows to 1.04.
  const scale = useSharedValue(on ? 1.04 : 1);
  useEffect(() => {
    scale.set(sheetTo(on ? 1.04 : 1, reduce));
  }, [on, reduce, scale]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Press
      onPress={onPress}
      haptic="select"
      darken={false}
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{ alignItems: 'center', gap: 6 }}
    >
      <Animated.View
        key={land}
        style={[
          {
            width: 76,
            height: 76,
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: on
              ? `0 0 0 2.5px ${palette.sheet}, 0 0 0 4.5px ${palette.text}`
              : `0 0 0 1px ${palette.hairline}`,
          },
          grow,
        ]}
      >
        <ArtStill scene="strip" width={76} height={76} attrs={{ season: strip }} />
      </Animated.View>
      <Txt variant="buttonSmall" style={{ fontSize: 12.5 }}>
        {label}
      </Txt>
    </Press>
  );
}

/**
 * Planting a new farm: a name, a land for its palette, and the creator as its keeper. It
 * is planted with `POST /v1/farms`, its first invite goes out on the share sheet, and the farm
 * opens on move-in day.
 */
export function NewFarm() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  const valley = useValley();
  const [name, setName] = useState('');
  const [land, setLand] = useState<Land>('meadow');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const plant = async () => {
    if (!validFarmName(name) || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const made = await client.api.createFarm({
        name: name.trim(),
        land,
        timeZone: deviceTimeZone(getCalendars()[0]?.timeZone),
        hemisphere: hemisphereOf(getLocales()[0]?.regionCode),
      });
      haptics.success();
      await valley.choose(made.farm);
      void valley.refresh();
      await Share.share({
        message: t('farm.new.share', { name: name.trim(), url: made.invite.url }),
      });
      backToFarm();
    } catch (error) {
      const status = (error as { status?: number }).status;
      setProblem(status === 403 ? t('farm.new.noCritter') : t('farm.new.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 22, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Press onPress={() => router.back()} darken={false} accessibilityRole="button" hitSlop={12}>
          <Txt variant="fieldLabel" style={{ fontSize: 16 }} color={palette.secondary}>
            {t('farm.new.cancel')}
          </Txt>
        </Press>
        <Txt variant="rowTitle">{t('farm.new.nav')}</Txt>
        <View style={{ width: 50 }} />
      </View>
      <Txt variant="errorTitle" multiline accessibilityRole="header">
        {t('farm.new.title')}
      </Txt>
      <Txt variant="sheetBody" multiline color={palette.body}>
        {t('farm.new.body')}
      </Txt>
      <TextField
        label={t('farm.new.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('farm.new.namePlaceholder')}
        maxLength={LIMITS.farmName}
        returnKeyType="done"
        autoCapitalize="words"
      />
      <View style={{ gap: 10 }}>
        <Txt variant="label" color={palette.secondary}>
          {t('farm.new.land')}
        </Txt>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          accessibilityRole="radiogroup"
        >
          {LANDS.map((l) => (
            <LandTile
              key={l.id}
              land={l.id}
              strip={l.strip}
              label={t(`farm.land.${l.id}`)}
              on={land === l.id}
              onPress={() => setLand(l.id)}
            />
          ))}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: radii.field,
          backgroundColor: palette.chip.invitedBg,
        }}
      >
        <ArtIcon name="people" size={22} color={palette.chip.suggestionFg} />
        <Txt variant="notice" multiline color={palette.chip.suggestionFg} style={{ flex: 1 }}>
          {t('farm.new.note')}
        </Txt>
      </View>
      {problem ? (
        <Txt
          variant="note"
          multiline
          color={palette.destructive.bg}
          accessibilityLiveRegion="polite"
        >
          {problem}
        </Txt>
      ) : null}
      <View style={{ marginTop: 'auto', marginBottom: Math.max(insets.bottom, 34) }}>
        <Button
          label={busy ? t('farm.new.planting') : t('farm.new.plant')}
          kind="go"
          disabled={!validFarmName(name) || busy}
          onPress={() => void plant()}
        />
      </View>
    </View>
  );
}
