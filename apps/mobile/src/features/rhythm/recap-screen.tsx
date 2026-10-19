import type { FarmId, LocalDate, PersonId, WeeklyRecap } from '@kithfield/contracts';
import { router } from 'expo-router';
import { ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rhythmColours } from '@kithfield/theme';

import { useFarm } from '../../data';
import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { TravelAnchor, travelIds } from '../../ui/travel';
import { Avatar } from '../../ui/art/avatar';
import { lookOf } from '../../ui/art/critter-look';
import { EmptyState, ErrorState } from '../../ui/components/state-shell';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { nameOf } from '../farm/farm-copy';
import { typeAt } from '../farm/type-at';
import { LoadingRows } from '../farm/farm-states';
import { ActionButton, BackButton, Faces } from './chrome';
import { handText, inSentence } from './copy';
import { recapCopy } from './recap-copy';
import { useLoad, useRhythmApi } from './rhythm-api';
import { rhythmRoutes } from './routes';

/** "sunday 18 october": the recap's Sunday in the reader's language, as the hand writes it. */
function weekLabel(week: LocalDate, language: string): string {
  const [y, m, d] = week.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12));
  const format = new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return format.format(date).toLocaleLowerCase(language);
}

/** The Sunday harvest: the week's letter, its best pollinator and thanks to quiet friends. */
export function RecapScreen({ farm, week }: { readonly farm: FarmId; readonly week?: LocalDate }) {
  const { t, language, fontLocale } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const api = useRhythmApi();
  const recap = useLoad(() => api.recap(farm, week), [api, farm, week]);
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View
        style={{
          position: 'absolute',
          top: insets.top + 3,
          left: 20,
          right: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 2,
        }}
      >
        <BackButton onPress={() => router.back()} />
        {recap.status === 'ready' ? (
          <Txt variant="handS" color={palette.muted} style={typeAt('handS', 17, 18.7, fontLocale)}>
            {handText(weekLabel(recap.value.week, language))}
          </Txt>
        ) : null}
        <View style={{ width: 44 }} />
      </View>
      {recap.status === 'ready' ? (
        <RecapCard farm={farm} recap={recap.value} top={insets.top + 59} />
      ) : recap.status === 'failed' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState
            art={<ArtStill scene="spot" width={240} height={172} attrs={{ name: 'offline' }} />}
            title={t('rhythm.recap.empty.title')}
            body={t('rhythm.loadFailed')}
            action={{ label: t('rhythm.tryAgain'), onPress: recap.reload }}
          />
        </View>
      ) : (
        <LoadingRows />
      )}
    </View>
  );
}

function RecapCard({
  farm,
  recap,
  top,
}: {
  readonly farm: FarmId;
  readonly recap: WeeklyRecap;
  readonly top: number;
}) {
  const { t, fontLocale, language } = useLocale();
  const { palette, appearance } = useTheme();
  const colours = rhythmColours[appearance];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const state = useFarm(farm)?.state ?? null;
  const critterOf = (p: PersonId) =>
    (state?.members.find((m) => m.person === p) ?? state?.former.find((m) => m.person === p))
      ?.critter ?? null;
  const copy = recapCopy(t, recap, inSentence(state?.name ?? '', language), (p) =>
    nameOf(t, state, p),
  );
  const cardW = width - 32;
  const pollinatorCritter = copy.pollinator ? critterOf(copy.pollinator.person) : null;
  const thanked = (copy.thanks?.people ?? []).flatMap((p) => {
    const c = critterOf(p);
    return c ? [c] : [];
  });
  const share = () =>
    void Share.share({
      message: t('rhythm.recap.shareText', { title: copy.title, body: copy.body }),
    });

  if (recap.thanks.length === 0 && recap.letterState === 'none' && recap.plans.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          art={
            <TravelAnchor
              id={travelIds.harvestBasket(farm)}
              sprite={{ scene: 'harvest', width: 240, height: 140 }}
            >
              <ArtStill scene="harvest" width={240} height={140} />
            </TravelAnchor>
          }
          title={t('rhythm.recap.empty.title')}
          body={t('rhythm.recap.restful')}
        />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ borderRadius: 32, backgroundColor: colours.recapCard, overflow: 'hidden' }}>
          {/* The basket the farm's crops hop into on the way here (signature motion). */}
          <TravelAnchor
            id={travelIds.harvestBasket(farm)}
            sprite={{ scene: 'harvest', width: cardW, height: 176 }}
          >
            <ArtStill scene="harvest" width={cardW} height={176} />
          </TravelAnchor>
          <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
            <Txt
              variant="handL"
              color={colours.recapEyebrow}
              style={typeAt('handL', 18, 19.8, fontLocale)}
            >
              {handText(t('rhythm.recap.eyebrow'))}
            </Txt>
            <Txt
              variant="displayM"
              multiline
              accessibilityRole="header"
              style={typeAt('displayM', 27, 29.7, fontLocale)}
            >
              {copy.title}
            </Txt>
            <Txt variant="sheetBody" multiline color={colours.recapBody}>
              {copy.body}
            </Txt>
            {copy.pollinator ? (
              <View
                accessible
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 22,
                  backgroundColor: colours.recapBox,
                }}
              >
                <ArtStill scene="icon" width={64} height={64} attrs={{ name: 'rosette' }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt
                    variant="handS"
                    color={colours.recapEyebrow}
                    style={typeAt('handS', 16, 16, fontLocale)}
                  >
                    {handText(t('rhythm.recap.pollinator'))}
                  </Txt>
                  <Txt
                    variant="displayM"
                    numberOfLines={1}
                    style={[typeAt('displayM', 22, 24.2, fontLocale), { marginTop: 2 }]}
                  >
                    {nameOf(t, state, copy.pollinator.person)}
                  </Txt>
                  <Txt
                    variant="notice"
                    multiline
                    color={colours.recapBody}
                    style={[typeAt('caption', 13.5, 18.2, fontLocale), { marginTop: 2 }]}
                  >
                    {copy.pollinator.reason}
                  </Txt>
                </View>
                {pollinatorCritter ? (
                  <Avatar
                    kind={pollinatorCritter.species}
                    look={lookOf(pollinatorCritter)}
                    size={44}
                  />
                ) : null}
              </View>
            ) : null}
            {copy.thanks ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {thanked.length > 0 ? (
                  <Faces critters={thanked} size={28} ring={colours.recapCard} />
                ) : null}
                <Txt variant="notice" multiline color={colours.recapBody} style={{ flex: 1 }}>
                  {copy.thanks.line}
                </Txt>
              </View>
            ) : null}
            <Press
              onPress={() => router.push(rhythmRoutes.aiConsent())}
              darken={false}
              accessibilityRole="link"
              accessibilityLabel={`${copy.byAi ? t('rhythm.recap.ai') : t('rhythm.recap.local')} ${t('rhythm.recap.aiChange')}`}
              style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 2, paddingTop: 2 }}
            >
              <ArtIcon name="pencil" size={14} color={palette.secondary} style={{ marginTop: 1 }} />
              <Txt
                variant="code"
                multiline
                color={palette.secondary}
                style={[typeAt('caption', 12.5, 16.25, fontLocale), { flex: 1, fontWeight: '500' }]}
              >
                {copy.byAi ? t('rhythm.recap.ai') : t('rhythm.recap.local')}{' '}
                <Txt
                  variant="code"
                  color={palette.secondary}
                  style={{ fontWeight: '500', textDecorationLine: 'underline' }}
                >
                  {t('rhythm.recap.aiChange')}
                </Txt>
              </Txt>
            </Press>
          </View>
        </View>
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: Math.max(34, insets.bottom),
          flexDirection: 'row',
          gap: 10,
        }}
      >
        <ActionButton
          label={t('rhythm.recap.plant')}
          onPress={() => router.push(rhythmRoutes.plant(farm))}
          bg={palette.fillSecondary}
          fg={palette.text}
          small
          style={{ flex: 1 }}
        />
        <ActionButton
          label={t('rhythm.recap.share')}
          onPress={share}
          bg={palette.primary.bg}
          fg={palette.primary.fg}
          style={{ flex: 1.3 }}
        />
      </View>
    </>
  );
}
