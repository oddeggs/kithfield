import type { FarmId, FarmState, RareVariant } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { fieldGuideWashes } from '@kithfield/theme';
import { router } from 'expo-router';
import { ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useFarmView } from '../../data';
import { ArtIcon } from '../../ui/art/art-view';
import { CritterStack } from '../../ui/components/card';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { say } from '../farm/farm-copy';
import { NightVeil } from '../farm/panel';
import { useNow } from '../farm/use-now';
import { typeAt } from '../farm/type-at';
import { familyName, plantTitle } from './guide-copy';
import { guideMotion, useGuideLook } from './guide-look';
import { STRIP, entryOf, plantStatus, stripIndex, tileLook, variantArt } from './guide-model';
import { foundLine, plantCredits, rareLine, sleepyLine } from './page-copy';
import { BoldLine, HeroSheet, PlantTile, RoundButton, Sway, sendersOf, useHeroTint } from './parts';

const W = 393;

const RARE_ICON: Record<RareVariant, string> = {
  rain_kissed: 'raincloud',
  frost_lace: 'sparkle',
  sun_gold: 'sun',
};

/**
 * A plant's page: the plant swaying in its own colour, its six stages with where it is outlined,
 * who grew it (names and care, never numbers), how it naps and wakes, and its rare variant.
 */
export function PlantScreen({
  farm,
  plant,
  variant,
}: {
  readonly farm: FarmId;
  readonly plant: string;
  readonly variant: RareVariant | null;
}) {
  const now = useNow();
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  return <PlantPage state={state} view={view} plant={plant} variant={variant} />;
}

/** A plant's page drawn from a farm and its view. */
export function PlantPage({
  state,
  view,
  plant,
  variant,
}: {
  readonly state: FarmState | null;
  readonly view: FarmView | null;
  readonly plant: string;
  readonly variant: RareVariant | null;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette } = useTheme();
  const look = useGuideLook();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const tint = useHeroTint(plant);
  const entry = entryOf(plant);
  const back = (
    <View style={{ position: 'absolute', top: insets.top - 1, left: 16 }}>
      <RoundButton label={t('fieldGuide.back')} onPress={() => router.back()} />
    </View>
  );
  if (!state || !entry) {
    return <View style={{ flex: 1, backgroundColor: palette.sheet }}>{back}</View>;
  }

  const status = plantStatus(state, view, entry);
  const rarePage = variant
    ? state.fieldGuide.find((p) => p.plant === plant && p.variant === variant)
    : undefined;
  const hero = rarePage
    ? { stage: 3, state: variantArt(rarePage.variant ?? 'rain_kissed'), sketch: false }
    : status
      ? tileLook(status)
      : { stage: 3, state: '', sketch: false };
  const background = rarePage?.variant ? fieldGuideWashes.rare[rarePage.variant] : tint;
  const sleepy = hero.state === 'sleepy';
  const found = rarePage ?? (status?.kind === 'found' ? status.page : null);
  const outlined = status ? stripIndex(status) : entry.role === 'rose' ? 3 : null;
  const title = plantTitle(t, language, state, plant);
  const subtitle =
    entry.role === 'rose'
      ? t('fieldGuide.page.subtitleRose')
      : entry.role === 'signature'
        ? t('fieldGuide.page.subtitleSignature')
        : entry.family && entry.season
          ? t('fieldGuide.page.subtitle', {
              season: say(t, `fieldGuide.season.${entry.season}`),
              family: familyName(t, entry.family),
              kinds: say(t, `fieldGuide.family.${entry.family}.kinds`),
            })
          : t('fieldGuide.page.subtitlePot', {
              season: say(t, `fieldGuide.season.${entry.season ?? state.season.season}`),
            });
  const mark =
    found !== null
      ? { text: foundLine(t, state, found), color: look.found }
      : status?.kind === 'growing'
        ? {
            text: t('fieldGuide.status.growing', {
              stage: say(t, `fieldGuide.stage.${status.stage}`),
            }),
            color: look.growing,
          }
        : status
          ? {
              text: t(
                status.kind === 'resting'
                  ? 'fieldGuide.status.resting'
                  : 'fieldGuide.status.notYet',
              ),
              color: look.notYet,
            }
          : null;
  const credits = plantCredits(t, state, entry, found !== null);
  const rare = rareLine(t, language, state, entry);
  const rareVariant =
    state.fieldGuide.find((p) => p.plant === plant && p.variant !== null)?.variant ?? 'rain_kissed';
  const share = () => {
    if (!found) return;
    void Share.share({
      message: t('fieldGuide.page.shareText', {
        plant: title,
        farm: state.name ?? '',
      }),
    });
  };
  const tileW = (width - 40 - 5 * 4) / 6;

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 360 * k,
          backgroundColor: background,
        }}
      />
      <Sway
        degrees={guideMotion.sway.degrees}
        periodMs={sleepy ? guideMotion.sleepyPeriodMs : guideMotion.sway.periodMs}
        width={width}
        height={250 * k}
        style={{ position: 'absolute', left: 0, top: insets.top + 25 }}
      >
        <PlantTile
          art={{ plant, stage: hero.stage, state: hero.state, pot: entry.inPot, color: 'none' }}
          sketch={hero.sketch}
          width={width}
          height={250 * k}
        />
      </Sway>
      <NightVeil width={width} height={360 * k} />
      {back}
      {found ? (
        <View style={{ position: 'absolute', top: insets.top - 1, right: 16 }}>
          <RoundButton label={t('fieldGuide.page.share')} icon="share" onPress={share} />
        </View>
      ) : null}
      <HeroSheet top={330 * k}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 12,
            gap: 12,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Txt
                variant="displayL"
                multiline
                accessibilityRole="header"
                style={typeAt('displayL', 30, 33.6, fontLocale)}
              >
                {title}
              </Txt>
              <Txt
                variant="caption"
                multiline
                color={palette.secondary}
                style={{ ...typeAt('caption', 13.5, 17.55, fontLocale), marginTop: 2 }}
              >
                {subtitle}
              </Txt>
            </View>
            {mark ? (
              <Txt
                variant="handS"
                multiline
                color={mark.color}
                style={{ ...typeAt('handS', 16, 17.6, fontLocale), marginTop: 12, maxWidth: 72 }}
              >
                {mark.text}
              </Txt>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {STRIP.map((s, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                <View
                  style={{
                    borderRadius: 12,
                    boxShadow: i === outlined ? look.stageRing : undefined,
                  }}
                >
                  <PlantTile
                    art={{ plant, stage: s.stage, state: s.state, pot: entry.inPot }}
                    width={Math.min(54, tileW)}
                    height={60}
                    radius={12}
                  />
                </View>
                <Txt
                  variant="caption"
                  color={palette.secondary}
                  numberOfLines={1}
                  style={typeAt('rowTitle', 10.5, 10.5, fontLocale)}
                >
                  {say(
                    t,
                    i === 5 ? 'fieldGuide.stageName.sleepy' : `fieldGuide.stageName.${s.stage}`,
                  )}
                </Txt>
              </View>
            ))}
          </View>
          {credits ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 18,
                backgroundColor: palette.card,
              }}
            >
              {credits.people.length > 0 ? (
                <CritterStack
                  friends={sendersOf(t, state, credits.people)}
                  size={28}
                  ring={palette.card}
                />
              ) : null}
              <BoldLine
                {...credits}
                variant="body"
                color={palette.creditText}
                size={14}
                line={19.6}
              />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <ArtIcon name="moon" size={20} color={palette.secondary} style={{ marginTop: 1 }} />
            <BoldLine
              before={sleepyLine(t, language, state, entry)}
              bold=""
              after=""
              variant="caption"
              color={look.paragraph}
              size={13.5}
              line={19.6}
            />
          </View>
          {rare ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <ArtIcon
                name={RARE_ICON[rareVariant]}
                size={20}
                color={palette.secondary}
                style={{ marginTop: 1 }}
              />
              <BoldLine
                {...rare}
                variant="caption"
                color={look.paragraph}
                size={13.5}
                line={19.6}
              />
            </View>
          ) : null}
        </ScrollView>
      </HeroSheet>
    </View>
  );
}
