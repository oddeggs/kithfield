import type { FarmId, FarmState, Season } from '@kithfield/contracts';
import { SEASONS, type FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useFarmView } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { EmptyState } from '../../ui/components/state-shell';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { Segmented } from '../../ui/components/segmented';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { say } from '../farm/farm-copy';
import { useNow } from '../farm/use-now';
import { typeAt } from '../farm/type-at';
import { familyLine, plantTitle, seasonRange } from './guide-copy';
import { useGuideLook } from './guide-look';
import { foundCount, guideRows, rarePages, tileLook, type GuideRow } from './guide-model';
import { BookPage, LinkRow, PlantTile, RoundButton } from './parts';
import { fieldGuideRoutes } from './routes';

const FAMILY_ICON = {
  dew: 'dewdrop',
  words: 'chat',
  pictures: 'photo',
  voices: 'mic',
  gestures: 'firefly',
  gatherings: 'seeds',
} as const;

/**
 * The field guide: one season per page, the six families as rows (found, growing, resting, or a
 * pencil sketch still to come), then the plants of all year. Opens on the farm's season.
 */
export function GuideScreen({ farm }: { readonly farm: FarmId }) {
  const now = useNow();
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  return <GuidePage farm={farm} state={state} view={view} />;
}

/** The guide drawn from a farm and its view. */
export function GuidePage({
  farm,
  state,
  view,
}: {
  readonly farm: FarmId;
  readonly state: FarmState | null;
  readonly view: FarmView | null;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette } = useTheme();
  const look = useGuideLook();
  const insets = useSafeAreaInsets();
  const [season, setSeason] = useState<Season | null>(null);
  const shown = useSharedValue(1);
  const rowsStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const current = state?.season.season ?? 'spring';
  const tab = season ?? current;
  useEffect(() => {
    shown.set(0);
    shown.set(
      withTiming(1, { duration: 160, easing: Easing.linear, reduceMotion: ReduceMotion.Never }),
    );
  }, [tab, shown]);

  const top = (
    <View style={{ position: 'absolute', top: insets.top - 1, left: 16 }}>
      <RoundButton label={t('fieldGuide.back')} onPress={() => router.back()} />
    </View>
  );
  if (!state) {
    return <View style={{ flex: 1, backgroundColor: look.backdrop }}>{top}</View>;
  }
  if (state.kind !== 'farm') {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center' }}>
        <EmptyState
          art={<ArtStill scene="spot" width={240} height={180} attrs={{ name: 'empty' }} />}
          title={t('fieldGuide.visit.title')}
          body={t('fieldGuide.visit.body')}
        />
        {top}
      </View>
    );
  }

  const rows = guideRows(state, view, tab);
  const found = foundCount(rows);
  const rare = rarePages(state);
  const open = (plant: string) => router.push(fieldGuideRoutes.plant(farm, plant));
  const status = (row: GuideRow) => {
    const s = row.status;
    if (s.kind === 'found') return { text: t('fieldGuide.status.found'), color: look.found };
    if (s.kind === 'growing') {
      const stage = say(t, `fieldGuide.stage.${s.stage}`);
      return { text: t('fieldGuide.status.growing', { stage }), color: look.growing };
    }
    if (s.kind === 'resting') return { text: t('fieldGuide.status.resting'), color: look.notYet };
    return { text: t('fieldGuide.status.notYet'), color: look.notYet };
  };

  return (
    <View style={{ flex: 1, backgroundColor: look.backdrop }}>
      {top}
      <BookPage top={insets.top + 49} bottom={24}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 16, paddingRight: 14, paddingLeft: 24, gap: 10 }}
        >
          <View>
            <Txt
              variant="handS"
              color={look.found}
              numberOfLines={1}
              style={typeAt('handS', 16, 16, fontLocale)}
            >
              {t('fieldGuide.whose', { farm: state.name ?? '' })}
            </Txt>
            <Txt
              variant="displayL"
              accessibilityRole="header"
              numberOfLines={1}
              style={typeAt('displayL', 30, 31.5, fontLocale)}
            >
              {t('fieldGuide.title')}
            </Txt>
          </View>
          <Segmented
            label={t('fieldGuide.seasons.label')}
            value={tab}
            onChange={setSeason}
            segments={SEASONS.map((s) => ({ value: s, label: say(t, `fieldGuide.season.${s}`) }))}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <Txt
              variant="caption"
              color={palette.secondary}
              style={typeAt('caption', 12.5, 15, fontLocale)}
            >
              {seasonRange(t, tab, state.hemisphere, tab === current)}
            </Txt>
            <Txt variant="handS" color={look.growing} style={typeAt('handS', 14, 14, fontLocale)}>
              {found > 0
                ? t('fieldGuide.found', { count: found, total: rows.length })
                : t('fieldGuide.stillToCome')}
            </Txt>
          </View>
          <Animated.View style={[{ gap: 6 }, rowsStyle]}>
            {rows.map((row) => {
              const art = tileLook(row.status);
              const name = plantTitle(t, language, state, row.plant);
              const line = familyLine(t, row.family);
              const st = status(row);
              return (
                <Press
                  key={row.plant}
                  onPress={() => open(row.plant)}
                  accessibilityRole="button"
                  accessibilityLabel={t('fieldGuide.row', {
                    plant: name,
                    family: line,
                    status: st.text,
                  })}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: look.rule,
                  }}
                >
                  <PlantTile
                    art={{ plant: row.plant, stage: art.stage, state: art.state }}
                    sketch={art.sketch}
                    width={58}
                    radius={14}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt
                      variant="rowTitle"
                      numberOfLines={1}
                      style={typeAt('rowTitle', 15.5, 18.6, fontLocale)}
                    >
                      {name}
                    </Txt>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}
                    >
                      <ArtStill
                        scene="icon"
                        width={14}
                        height={14}
                        attrs={{
                          name: FAMILY_ICON[row.family],
                          ...(look.iconInk ? { color: look.iconInk } : {}),
                        }}
                      />
                      <Txt
                        variant="caption"
                        color={palette.secondary}
                        numberOfLines={1}
                        style={{ ...typeAt('caption', 12.5, 15, fontLocale), flexShrink: 1 }}
                      >
                        {line}
                      </Txt>
                    </View>
                  </View>
                  <Txt
                    variant="handS"
                    color={st.color}
                    numberOfLines={1}
                    style={typeAt('handS', 14, 14, fontLocale)}
                  >
                    {st.text}
                  </Txt>
                </Press>
              );
            })}
          </Animated.View>
          <Txt
            variant="label"
            color={palette.secondary}
            style={{ ...typeAt('label', 11, 11, fontLocale), marginTop: 4 }}
          >
            {t('fieldGuide.allYear')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <AllYearTile
              art={{ plant: 'rose', stage: 3 }}
              title={t('fieldGuide.rose')}
              sub={t('fieldGuide.rose.sub')}
              onPress={() => open('rose')}
            />
            {state.signature ? (
              <AllYearTile
                art={{ plant: state.signature, stage: 3 }}
                title={plantTitle(t, language, state, state.signature)}
                sub={t('fieldGuide.signature.sub')}
                onPress={() => open(state.signature ?? '')}
              />
            ) : null}
            <AllYearTile
              art={{ plant: rare[0]?.plant ?? 'sunflower', stage: 3, state: 'rain' }}
              title={t('fieldGuide.rarePages')}
              sub={
                rare.length > 0
                  ? t('fieldGuide.rarePages.found', { count: rare.length })
                  : t('fieldGuide.rarePages.none')
              }
              onPress={() => {
                const newest = rare[0];
                router.push(
                  newest
                    ? fieldGuideRoutes.plant(farm, newest.plant, newest.variant)
                    : fieldGuideRoutes.plants(farm),
                );
              }}
            />
          </View>
          <View style={{ gap: 8, marginTop: 14, paddingBottom: insets.bottom + 16 }}>
            <LinkRow
              icon="sun"
              title={t('fieldGuide.more.seasons')}
              sub={t('fieldGuide.more.seasonsSub')}
              onPress={() => router.push(fieldGuideRoutes.seasons(farm))}
            />
            <LinkRow
              icon="sprout"
              title={t('fieldGuide.more.plants')}
              sub={t('fieldGuide.more.plantsSub')}
              onPress={() => router.push(fieldGuideRoutes.plants(farm))}
            />
          </View>
        </ScrollView>
      </BookPage>
    </View>
  );
}

function AllYearTile({
  art,
  title,
  sub,
  onPress,
}: {
  readonly art: { plant: string; stage: number; state?: string };
  readonly title: string;
  readonly sub: string;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const { fontLocale } = useLocale();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
      style={{ flex: 1, alignItems: 'center', gap: 3 }}
    >
      <PlantTile art={art} width={64} radius={14} />
      <Txt
        variant="rowTitle"
        align="center"
        numberOfLines={1}
        style={typeAt('rowTitle', 12.5, 13.75, fontLocale)}
      >
        {title}
      </Txt>
      <Txt
        variant="caption"
        align="center"
        color={palette.secondary}
        numberOfLines={1}
        style={typeAt('caption', 11.5, 11.5, fontLocale)}
      >
        {sub}
      </Txt>
    </Press>
  );
}
