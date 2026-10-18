import type { Me } from '@kithfield/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { Toggle } from '../../../ui/components/toggle';
import { useLocale } from '../../../ui/locale/locale-provider';
import { fadeTo } from '../../../ui/motion/motion';
import { Press } from '../../../ui/motion/press';
import { tabBarClearance } from '../../../ui/tab-bar/tab-bar';
import { useYouCritter } from '../../../ui/tab-bar/tab-activity';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useSafetyNoteArrival } from '../../safety/notes-screen';
import { useSettingsApi } from '../api/use-api';
import { lookOf, sceneAttrsOf, seasonHere } from '../format';
import { useKitColors } from '../kit/colors';
import { IconSegments } from '../kit/icon-segments';
import { useDesignTop } from '../kit/layout';
import { KText } from '../kit/text';
import { go } from '../go';
import { useRemote } from '../use-remote';
import { useBattery, type Battery } from './battery';

const STAGE_HEIGHT = 250;
/**
 * The scene time the renderer draws a still at. A whole scene this size is too big to cache as a
 * loop, so it is drawn once and the swap between stage and burrow is a cross-fade.
 */
const STILL_T = 1.2;

/** The You tab: your critter on its stage, your social battery, and Hibernate. */
export function YouScreen() {
  const api = useSettingsApi();
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const { width } = useWindowDimensions();
  const me = useRemote(() => api.me());
  const farms = useRemote(() => api.farms());
  useSafetyNoteArrival();
  useFocusEffect(
    useCallback(() => {
      me.reload();
      farms.reload();
      // Read again on each return to the tab.
    }, [me.reload, farms.reload]),
  );

  const person = me.data;
  const critter = person?.critter ?? null;
  useYouCritter(critter ? { kind: critter.species, look: lookOf(critter) } : null);

  const farmIds = useMemo(() => (farms.data?.farms ?? []).map((f) => f.farm), [farms.data]);
  const farmCount = (farms.data?.farms ?? []).filter((f) => f.kind === 'farm').length;
  const [battery, setBattery] = useBattery(farmIds, person?.person ?? null);

  const [hibernating, setHibernating] = useState<boolean | null>(null);
  useEffect(() => {
    if (person) setHibernating(person.hibernating);
  }, [person]);
  const hib = hibernating ?? false;
  const toggleHibernate = (on: boolean) => {
    setHibernating(on);
    api.hibernate(on).then(
      () => me.set((m: Me) => ({ ...m, hibernating: on })),
      () => {
        setHibernating(!on);
        toast.show(t('settings.failed'));
      },
    );
  };

  const name = person?.name ?? '';
  const species = critter ? t(`settings.species.${critter.species}`) : '';
  const tag = hib
    ? t('settings.you.tag.hibernating')
    : battery === 'resting'
      ? t('settings.you.tag.resting')
      : t('settings.you.tag.open');
  const stageWidth = width - 40;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: top(62),
          paddingBottom: tabBarClearance(insets.bottom),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            height: 44,
            paddingLeft: 20,
            paddingRight: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Txt variant="displayL" accessibilityRole="header" style={{ lineHeight: 37.4 }}>
            {t('settings.you.title')}
          </Txt>
          <Press
            onPress={() => go('/(tabs)/you/settings')}
            radius={22}
            accessibilityRole="button"
            accessibilityLabel={t('settings.you.openSettings')}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: kit.glass.fill,
              borderWidth: 1,
              borderColor: kit.glass.border,
            }}
          >
            <Txt variant="body" style={{ fontSize: 18, lineHeight: 18, marginTop: -8 }}>
              ···
            </Txt>
          </Press>
        </View>

        <View
          style={{
            marginTop: 10,
            marginHorizontal: 20,
            height: STAGE_HEIGHT,
            borderTopLeftRadius: 125,
            borderTopRightRadius: 125,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
            backgroundColor: kit.stage,
            overflow: 'hidden',
          }}
        >
          {critter ? (
            <Stage
              attrs={sceneAttrsOf(critter)}
              width={stageWidth}
              hibernating={hib}
              resting={battery === 'resting'}
              season={seasonHere(person?.settings.timeZone ?? 'UTC', Date.now())}
            />
          ) : null}
          <View
            style={{
              position: 'absolute',
              top: 16,
              alignSelf: 'center',
              paddingHorizontal: 12,
              paddingTop: 6,
              paddingBottom: 7,
              borderRadius: 14,
              backgroundColor: kit.tag,
            }}
          >
            <Txt variant="handS" style={{ fontSize: 16, lineHeight: 16 }} numberOfLines={1}>
              {tag}
            </Txt>
          </View>
        </View>

        <View
          style={{
            marginTop: 14,
            marginHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1 }}>
            <Txt variant="displayM" style={{ fontSize: 24, lineHeight: 26.4 }} numberOfLines={1}>
              {name}
            </Txt>
            <KText
              kind="rowSub"
              color={palette.secondary}
              style={{ fontSize: 14, lineHeight: 18.2 }}
            >
              {farmCount > 0
                ? t('settings.you.lives', { species, count: farmCount })
                : t('settings.you.noFarm', { species })}
            </KText>
          </View>
          <Press
            onPress={() => go('/wardrobe')}
            radius={17}
            accessibilityRole="button"
            accessibilityLabel={t('settings.you.wardrobe')}
            style={{
              height: 34,
              paddingHorizontal: 14,
              borderRadius: 17,
              backgroundColor: palette.fillSecondary,
              justifyContent: 'center',
            }}
          >
            <KText kind="pill" style={{ fontSize: 14, lineHeight: 17 }}>
              {t('settings.you.wardrobe')}
            </KText>
          </Press>
        </View>

        <View style={{ marginTop: 21, marginHorizontal: 16, gap: 10 }}>
          <BatteryCard name={name} battery={battery} onChange={setBattery} />
          <View
            style={{
              borderRadius: 22,
              backgroundColor: palette.card,
              borderWidth: 1,
              borderColor: palette.cardBorder,
              paddingVertical: 12,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: kit.hibernateTile,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArtIcon name="moon" size={22} color={kit.hibernateMoon} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <KText kind="rowTitle" style={{ fontSize: 16, lineHeight: 19.2 }}>
                {t('settings.hibernate.title')}
              </KText>
              <KText kind="rowSub" multiline color={palette.secondary} style={{ marginTop: 2 }}>
                {hib ? t('settings.hibernate.on') : t('settings.hibernate.off')}
              </KText>
            </View>
            <Toggle
              value={hib}
              onChange={toggleHibernate}
              label={t('settings.hibernate.title')}
              disabled={hibernating === null}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function BatteryCard({
  name,
  battery,
  onChange,
}: {
  readonly name: string;
  readonly battery: Battery;
  readonly onChange: (b: Battery) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View
      style={{
        borderRadius: 22,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <KText kind="rowTitle" style={{ fontSize: 16, lineHeight: 16 }}>
          {t('settings.battery.title')}
        </KText>
        <Txt variant="handS" color={palette.muted} style={{ lineHeight: 16.5 }}>
          {t('settings.battery.visible')}
        </Txt>
      </View>
      <IconSegments
        label={t('settings.battery.title')}
        value={battery}
        onChange={onChange}
        segments={[
          {
            value: 'resting',
            label: t('settings.battery.resting'),
            icon: 'moon',
            iconColor: palette.secondary,
          },
          { value: 'open', label: t('settings.battery.open'), icon: 'lantern' },
        ]}
      />
      <Txt
        variant="body"
        multiline
        color={palette.body}
        style={{ fontSize: 14, lineHeight: 19.6, marginTop: 10 }}
      >
        {battery === 'resting'
          ? t('settings.battery.restingText', { name })
          : t('settings.battery.openText', { name })}
      </Txt>
    </View>
  );
}

/** The critter on its stage, or tucked into the burrow while hibernating; the two cross-fade. */
function Stage({
  attrs,
  width,
  hibernating,
  resting,
  season,
}: {
  readonly attrs: Record<string, string>;
  readonly width: number;
  readonly hibernating: boolean;
  readonly resting: boolean;
  readonly season: string;
}) {
  const burrow = useSharedValue(hibernating ? 1 : 0);
  useEffect(() => {
    burrow.set(fadeTo(hibernating ? 1 : 0));
  }, [hibernating, burrow]);
  const stageStyle = useAnimatedStyle(() => ({ opacity: 1 - burrow.get() }));
  const burrowStyle = useAnimatedStyle(() => ({ opacity: burrow.get() }));
  return (
    <>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, stageStyle]}>
        <ArtStill
          scene="stage"
          width={width}
          height={STAGE_HEIGHT}
          attrs={{ ...attrs, state: resting ? 'sleep' : 'open', season }}
          t={STILL_T}
        />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, burrowStyle]}>
        <ArtStill scene="burrow" width={width} height={STAGE_HEIGHT} attrs={attrs} t={STILL_T} />
      </Animated.View>
    </>
  );
}
