import type { FarmId, FarmState, PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm } from '../../data';
import { CritterStack } from '../../ui/components/card';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { Txt } from '../../ui/type/text';
import { say } from '../farm/farm-copy';
import { typeAt } from '../farm/type-at';
import { dateOf, monthLong, plantTitle } from './guide-copy';
import { scrapCard, scrapCardHeight, useGuideLook } from './guide-look';
import { porchNames } from './page-copy';
import { BookPage, PlantTile, RoundButton, sendersOf } from './parts';
import { otherOnPorch, scrapbookCards, type ScrapbookCard } from './porch-model';

/**
 * A visit's own little scrapbook: one pressed bloom each season, dated, and dashed cards for the
 * seasons still growing or to come. Just the two of them; never in a farm's field guide.
 */
export function ScrapbookScreen({ visit }: { readonly visit: FarmId }) {
  const me = useSession().person?.id ?? null;
  const state = useFarm(visit)?.state ?? null;
  return <ScrapbookPage state={state} me={me} />;
}

/** The little scrapbook drawn from a visit. */
export function ScrapbookPage({
  state,
  me,
}: {
  readonly state: FarmState | null;
  readonly me: PersonId | null;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette } = useTheme();
  const look = useGuideLook();
  const insets = useSafeAreaInsets();
  const ax = useAccessibilitySize();
  const back = (
    <View style={{ position: 'absolute', top: insets.top - 1, left: 16 }}>
      <RoundButton label={t('fieldGuide.back')} onPress={() => router.back()} glass />
    </View>
  );
  if (!state || !me) {
    return <View style={{ flex: 1, backgroundColor: look.backdrop }}>{back}</View>;
  }
  const other = otherOnPorch(state, me);
  const cards = scrapbookCards(state);
  const line = (card: ScrapbookCard) => {
    const plant = plantTitle(t, language, state, card.plant);
    if (card.kind === 'pressed') return t('fieldGuide.scrapbook.pressedLine', { plant });
    if (card.kind === 'growing') {
      return t('fieldGuide.scrapbook.growing', {
        plant,
        stage: say(t, `fieldGuide.scrapbook.stage.${card.stage}`),
      });
    }
    return t('fieldGuide.scrapbook.waiting', { plant, month: monthLong(t, card.startMonth) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: look.backdrop }}>
      <BookPage top={insets.top + 49} bottom={24}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 18,
            paddingRight: 16,
            paddingBottom: 16,
            paddingLeft: 26,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CritterStack
              friends={sendersOf(t, state, [me, ...(other ? [other.person] : [])])}
              size={34}
              ring={look.page}
            />
            <View style={{ flex: 1 }}>
              <Txt
                variant="handS"
                numberOfLines={ax ? undefined : 1}
                color={look.found}
                style={typeAt('handS', 16, 16, fontLocale)}
              >
                {porchNames(t, state, me)}
              </Txt>
              <Txt
                variant="displayM"
                accessibilityRole="header"
                numberOfLines={ax ? undefined : 1}
                style={typeAt('displayM', 26, 27.3, fontLocale)}
              >
                {t('fieldGuide.scrapbook.title')}
              </Txt>
            </View>
          </View>
          <Txt
            variant="caption"
            multiline
            color={palette.body}
            style={typeAt('caption', 13.5, 19.6, fontLocale)}
          >
            {t('fieldGuide.scrapbook.body')}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 16 }}>
            {cards.map((card) => {
              const pressed = card.kind === 'pressed';
              const text = line(card);
              const season = say(t, `fieldGuide.season.${card.season}`);
              return (
                <View
                  key={card.season}
                  accessible
                  accessibilityLabel={`${season}. ${text}`}
                  style={{
                    width: '47.5%',
                    flexGrow: 1,
                    minHeight: pressed ? scrapCardHeight.pressed : scrapCardHeight.waiting,
                    alignItems: 'center',
                    gap: scrapCard.gap,
                    paddingTop: scrapCard.padTop,
                    paddingHorizontal: scrapCard.padX,
                    paddingBottom: scrapCard.padBottom,
                    borderRadius: 6,
                    ...(pressed
                      ? { backgroundColor: look.scrap.card, boxShadow: look.scrap.shadow }
                      : {
                          borderWidth: scrapCard.border,
                          borderStyle: 'dashed',
                          borderColor: look.scrap.dashed,
                        }),
                  }}
                >
                  {pressed ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -7,
                        width: 44,
                        height: 14,
                        backgroundColor: look.scrap.tape,
                        transform: [{ rotate: '-4deg' }],
                      }}
                    />
                  ) : null}
                  <PlantTile
                    art={{ plant: card.plant, stage: pressed ? 3 : 1, color: 'none' }}
                    sketch={!pressed}
                    width={scrapCard.art}
                  />
                  <Txt
                    variant="handS"
                    color={palette.text}
                    style={typeAt('handS', scrapCard.season, scrapCard.season, fontLocale)}
                  >
                    {season}
                  </Txt>
                  <Txt
                    variant="caption"
                    align="center"
                    multiline
                    color={palette.secondary}
                    style={typeAt('caption', scrapCard.note.size, scrapCard.note.line, fontLocale)}
                  >
                    {text}
                  </Txt>
                  {pressed && card.pressedAt !== null ? (
                    <Txt
                      variant="caption"
                      color={look.scrap.date}
                      style={typeAt('rowTitle', scrapCard.date, scrapCard.date, fontLocale)}
                    >
                      {t('fieldGuide.scrapbook.pressedOn', {
                        date: dateOf(t, state, card.pressedAt),
                      })}
                    </Txt>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </BookPage>
      {back}
    </View>
  );
}
