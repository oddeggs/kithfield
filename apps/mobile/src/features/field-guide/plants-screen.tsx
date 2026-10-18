import type { CareFamily, FarmId, Season } from '@kithfield/contracts';
import { FAMILIES, PORCH_POT, SEASONS, plantFor } from '@kithfield/farm';
import type { Language, Translate } from '@kithfield/i18n';
import { router } from 'expo-router';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { say } from '../farm/farm-copy';
import { typeAt } from '../farm/type-at';
import { familyName, monthsOf, plantTitle } from './guide-copy';
import { STRIP } from './guide-model';
import { PlantTile, RoundButton } from './parts';
import { fieldGuideRoutes } from './routes';

/** The design's three examples of rare variants. */
const RARE_EXAMPLES = ['lavender', 'camellia', 'pumpkin'] as const;
const RARE_COLUMNS = [
  { state: '', label: 'fieldGuide.stageName.3' },
  { state: 'rain', label: 'fieldGuide.variantName.rain_kissed' },
  { state: 'frost', label: 'fieldGuide.variantName.frost_lace' },
  { state: 'gold', label: 'fieldGuide.variantName.sun_gold' },
] as const;

const FAMILY_ICON: Record<CareFamily, string> = {
  dew: 'dewdrop',
  words: 'chat',
  pictures: 'photo',
  voices: 'mic',
  gestures: 'firefly',
  gatherings: 'seeds',
};

type Item =
  | {
      readonly kind: 'head';
      readonly key: string;
      readonly title: string;
      readonly sub: string;
      readonly rare: boolean;
    }
  | {
      readonly kind: 'row';
      readonly key: string;
      readonly plant: string;
      readonly name: string;
      readonly icon: string;
      readonly line: string;
      readonly pot: boolean;
      readonly rare: boolean;
      readonly last: boolean;
    };

/** Every plant in sections: the four seasons, all year and the porch pot, and rare variants. */
function itemsOf(
  t: Translate,
  language: Language,
  state: { readonly name: string | null; readonly signature: string | null } | null,
): Item[] {
  const months = (season: Season, h: 'north' | 'south') => monthsOf(t, season, h);
  const seasons = SEASONS.flatMap((season): Item[] => [
    {
      kind: 'head',
      key: season,
      title: say(t, `fieldGuide.season.${season}`),
      sub: t('fieldGuide.plants.range', {
        north: months(season, 'north'),
        south: months(season, 'south'),
      }),
      rare: false,
    },
    ...FAMILIES.map((family, i): Item => {
      const plant = plantFor(family, season);
      return {
        kind: 'row',
        key: plant,
        plant,
        name: plantTitle(t, language, state, plant),
        icon: FAMILY_ICON[family],
        line: familyName(t, family),
        pot: false,
        rare: false,
        last: i === FAMILIES.length - 1,
      };
    }),
  ]);
  const signature = state?.signature ?? 'plum';
  const allYear: Item[] = [
    {
      kind: 'head',
      key: 'all-year',
      title: t('fieldGuide.plants.allYear'),
      sub: t('fieldGuide.plants.allYearSub'),
      rare: false,
    },
    {
      kind: 'row',
      key: 'rose',
      plant: 'rose',
      name: t('fieldGuide.rose'),
      icon: 'rosette',
      line: t('fieldGuide.rose.sub'),
      pot: false,
      rare: false,
      last: false,
    },
    {
      kind: 'row',
      key: signature,
      plant: signature,
      name: plantTitle(t, language, state, signature),
      icon: 'farm',
      line: t('fieldGuide.plants.signature'),
      pot: false,
      rare: false,
      last: false,
    },
    ...SEASONS.map((season, i): Item => ({
      kind: 'row',
      key: PORCH_POT[season],
      plant: PORCH_POT[season],
      name: plantTitle(t, language, state, PORCH_POT[season]),
      icon: 'door',
      line: t('fieldGuide.plants.pot', { season: say(t, `fieldGuide.seasonWord.${season}`) }),
      pot: false,
      rare: false,
      last: i === SEASONS.length - 1,
    })),
  ];
  const rare: Item[] = [
    {
      kind: 'head',
      key: 'rare',
      title: t('fieldGuide.plants.rare'),
      sub: t('fieldGuide.plants.rareSub'),
      rare: true,
    },
    ...RARE_EXAMPLES.map((plant, i): Item => ({
      kind: 'row',
      key: `rare-${plant}`,
      plant,
      name: plantTitle(t, language, state, plant),
      icon: '',
      line: '',
      pot: false,
      rare: true,
      last: i === RARE_EXAMPLES.length - 1,
    })),
  ];
  return [...seasons, ...allYear, ...rare];
}

/**
 * Every plant at every stage, from seed to sleepy, by season; the plants of all year and the
 * porch pot; and the rare variants any bloom can take. A reference page, drawn with shared images
 * and only the rows on screen.
 */
export function PlantsScreen({ farm }: { readonly farm: FarmId }) {
  const { t, language, fontLocale } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const state = useFarm(farm)?.state ?? null;
  const items = itemsOf(t, language, state);
  const inner = width - 32 - 24;
  const tile = Math.floor((inner - 5 * 6) / 6);
  const rareTile = tile;
  const card = (first: boolean, last: boolean) => ({
    marginHorizontal: 16,
    paddingHorizontal: 12,
    backgroundColor: palette.panel,
    borderTopLeftRadius: first ? 24 : 0,
    borderTopRightRadius: first ? 24 : 0,
    borderBottomLeftRadius: last ? 24 : 0,
    borderBottomRightRadius: last ? 24 : 0,
    marginBottom: last ? 16 : 0,
  });
  const label = (text: string, w: number) => (
    <Txt
      key={text}
      variant="label"
      color={palette.secondary}
      align="center"
      numberOfLines={2}
      style={{ ...typeAt('label', 9.5, 11, fontLocale), width: w, letterSpacing: 0.4 }}
    >
      {text}
    </Txt>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        initialNumToRender={8}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <Txt
            variant="displayL"
            accessibilityRole="header"
            multiline
            style={{ marginHorizontal: 16, marginBottom: 16 }}
          >
            {t('fieldGuide.plants.title')}
          </Txt>
        }
        renderItem={({ item }) =>
          item.kind === 'head' ? (
            <View style={[card(true, false), { paddingTop: 18, gap: 10 }]}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  columnGap: 10,
                }}
              >
                <Txt
                  variant="displayM"
                  accessibilityRole="header"
                  style={typeAt('displayM', 24, 26.4, fontLocale)}
                >
                  {item.title}
                </Txt>
                <Txt
                  variant="caption"
                  multiline
                  color={palette.secondary}
                  style={typeAt('caption', 13, 16.9, fontLocale)}
                >
                  {item.sub}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 2 }}>
                {item.rare
                  ? RARE_COLUMNS.map((c) => label(say(t, c.label), rareTile))
                  : STRIP.map((s, i) =>
                      label(
                        say(
                          t,
                          i === 5
                            ? 'fieldGuide.stageName.sleepy'
                            : `fieldGuide.stageName.${s.stage}`,
                        ),
                        tile,
                      ),
                    )}
              </View>
            </View>
          ) : (
            <Press
              onPress={() => router.push(fieldGuideRoutes.plant(farm, item.plant))}
              accessibilityRole="button"
              accessibilityLabel={item.line ? `${item.name}, ${item.line}` : item.name}
              style={[
                card(false, item.last),
                { paddingTop: 8, paddingBottom: item.last ? 16 : 4, gap: 6 },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt variant="displayS" style={typeAt('displayS', 16, 17.6, fontLocale)}>
                  {item.name}
                </Txt>
                {item.icon ? (
                  <ArtStill
                    scene="icon"
                    width={13}
                    height={13}
                    attrs={{ name: item.icon, color: palette.secondary }}
                  />
                ) : null}
                {item.line ? (
                  <Txt
                    variant="caption"
                    color={palette.secondary}
                    style={typeAt('caption', 12, 15.6, fontLocale)}
                  >
                    {item.line}
                  </Txt>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {item.rare
                  ? RARE_COLUMNS.map((c) => (
                      <PlantTile
                        key={c.state}
                        art={{ plant: item.plant, stage: 3, state: c.state }}
                        width={rareTile}
                        radius={13}
                      />
                    ))
                  : STRIP.map((s, i) => (
                      <PlantTile
                        key={i}
                        art={{ plant: item.plant, stage: s.stage, state: s.state, pot: item.pot }}
                        width={tile}
                        radius={13}
                      />
                    ))}
              </View>
            </Press>
          )
        }
      />
      <View style={{ position: 'absolute', top: insets.top - 1, left: 16 }}>
        <RoundButton label={t('fieldGuide.back')} onPress={() => router.back()} />
      </View>
    </View>
  );
}
