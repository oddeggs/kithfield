import type { FarmId, FarmState, PersonId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { sizes } from '@kithfield/theme';
import { router } from 'expo-router';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useFarmView } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { castOf } from '../../ui/art/critter-look';
import { LayeredScene } from '../../ui/art/layered-scene';
import { CritterStack } from '../../ui/components/card';
import { EmptyState } from '../../ui/components/state-shell';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { Txt } from '../../ui/type/text';
import { numberWord, say } from '../farm/farm-copy';
import { useNow } from '../farm/use-now';
import { typeAt } from '../farm/type-at';
import { plantTitle } from './guide-copy';
import { guideMotion, useGuideLook } from './guide-look';
import { porchNames, potLine } from './page-copy';
import { LinkRow, PlantTile, RoundButton, Sway, sendersOf } from './parts';
import { otherOnPorch, porchFrozen, pressedCount, stageBar } from './porch-model';
import { fieldGuideRoutes } from './routes';

const W = 393;

/** The two on the porch, the other one first as the porch scene seats them. */
function porchCast(state: FarmState, me: PersonId): string {
  const mine = state.members.find((m) => m.person === me);
  const other = otherOnPorch(state, me);
  return [other, mine].flatMap((m) => (m ? [castOf(m.critter)] : [])).join(',');
}

/**
 * A visit's porch pot: the two of you on the porch with the pot swaying between you, how far it
 * has grown this season, who watered it (names, never numbers), and the way to the scrapbook.
 * Stays readable, frozen, when one of you has gone.
 */
export function PorchPotScreen({ visit }: { readonly visit: FarmId }) {
  const now = useNow();
  const me = useSession().person?.id ?? null;
  const state = useFarm(visit)?.state ?? null;
  const view = useFarmView<FarmView>(visit, now);
  return <PorchPotPage visit={visit} state={state} view={view} me={me} />;
}

/** The porch pot drawn from a visit and its view. */
export function PorchPotPage({
  visit,
  state,
  view,
  me,
}: {
  readonly visit: FarmId;
  readonly state: FarmState | null;
  readonly view: FarmView | null;
  readonly me: PersonId | null;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette, appearance } = useTheme();
  const look = useGuideLook();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // At the accessibility sizes nothing is cut to one line: the pill wraps clear of the back button,
  // and the stage names under the bar give way to the line above it, which names the stage.
  const ax = useAccessibilitySize();
  const k = width / W;
  const back = (
    <View style={{ position: 'absolute', top: insets.top - 1, left: 16 }}>
      <RoundButton label={t('fieldGuide.back')} onPress={() => router.back()} glass />
    </View>
  );
  if (!state || !me) {
    return <View style={{ flex: 1, backgroundColor: palette.sheet }}>{back}</View>;
  }
  const pot = state.kind === 'visit' ? state.pot : null;
  if (!pot) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center' }}>
        <EmptyState
          art={<ArtStill scene="spot" width={240} height={180} attrs={{ name: 'empty' }} />}
          title={t('fieldGuide.visit.title')}
          body={t('fieldGuide.pot.notVisit')}
        />
        {back}
      </View>
    );
  }

  const sleepy = view?.pot?.sleepy ?? false;
  const season = say(t, `fieldGuide.season.${state.season.season}`);
  const stage = sleepy ? t('fieldGuide.pot.napping') : say(t, `fieldGuide.pot.stage.${pot.stage}`);
  const bar = stageBar(pot.stage);
  const other = otherOnPorch(state, me);
  const pressed = pressedCount(state);
  const watered = [me, ...(other ? [other.person] : [])];

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <LayeredScene
        scene="porch"
        width={width}
        height={320 * k}
        attrs={{ cast: porchCast(state, me), ...(appearance === 'night' ? { night: true } : {}) }}
        style={{ position: 'absolute', left: 0, top: 0 }}
      />
      <Sway
        degrees={guideMotion.potSway.degrees}
        periodMs={sleepy ? guideMotion.sleepyPeriodMs : guideMotion.sway.periodMs}
        width={70 * k}
        height={96 * k}
        style={{ position: 'absolute', left: 162 * k, top: 196 * k }}
      >
        <PlantTile
          art={{
            plant: pot.plant,
            stage: pot.stage,
            state: sleepy ? 'sleepy' : '',
            pot: true,
            color: 'none',
          }}
          width={70 * k}
          height={96 * k}
        />
      </Sway>
      {back}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 1,
          alignSelf: 'center',
          paddingTop: 7,
          paddingBottom: 8,
          paddingHorizontal: 16,
          borderRadius: 22,
          backgroundColor: look.porchPill,
          alignItems: 'center',
          ...(ax ? { maxWidth: width - 2 * (16 + sizes.circle + 8) } : {}),
        }}
      >
        <Txt
          variant="displayS"
          align={ax ? 'center' : undefined}
          numberOfLines={ax ? undefined : 1}
          style={typeAt('displayS', 16, 18.4, fontLocale)}
        >
          {porchNames(t, state, me)}
        </Txt>
        <Txt
          variant="caption"
          align={ax ? 'center' : undefined}
          numberOfLines={ax ? undefined : 1}
          color={palette.body}
          style={typeAt('caption', 12, 14.4, fontLocale)}
        >
          {t('fieldGuide.pot.where')}
        </Txt>
      </View>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 300 * k,
          bottom: 0,
          backgroundColor: palette.sheet,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          boxShadow: palette.sheetShadow,
        }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 12,
            paddingHorizontal: 22,
            gap: 14,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 5,
              borderRadius: 3,
              backgroundColor: palette.grabber,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <PlantTile
              art={{ plant: pot.plant, stage: pot.stage, state: sleepy ? 'sleepy' : '', pot: true }}
              width={84}
              radius={20}
            />
            <View style={{ flex: 1 }}>
              <Txt variant="handS" color={look.found} style={typeAt('handS', 16, 16, fontLocale)}>
                {t('fieldGuide.pot.eyebrow')}
              </Txt>
              <Txt
                variant="displayM"
                accessibilityRole="header"
                numberOfLines={ax ? undefined : 1}
                style={typeAt('displayM', 26, 28.6, fontLocale)}
              >
                {plantTitle(t, language, state, pot.plant)}
              </Txt>
              <Txt
                variant="caption"
                color={palette.secondary}
                style={{ ...typeAt('caption', 13.5, 17.55, fontLocale), marginTop: 2 }}
              >
                {t('fieldGuide.pot.state', { season, stage })}
              </Txt>
            </View>
          </View>
          <View
            style={{ flexDirection: 'row', gap: 4 }}
            accessible
            accessibilityLabel={t('fieldGuide.pot.state', { season, stage })}
          >
            {bar.map((on, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View
                  style={{
                    alignSelf: 'stretch',
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: on ? look.found : look.bar.off,
                  }}
                />
                {ax ? null : (
                  <Txt
                    variant="caption"
                    numberOfLines={1}
                    color={i === pot.stage ? palette.text : look.bar.label}
                    style={typeAt('rowTitle', 11.5, 11.5, fontLocale)}
                  >
                    {say(t, `fieldGuide.stageName.${i}`)}
                  </Txt>
                )}
              </View>
            ))}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 18,
              backgroundColor: palette.card,
              borderWidth: 1,
              borderColor: palette.cardBorder,
            }}
          >
            <CritterStack
              friends={sendersOf(t, state, [...watered].reverse())}
              size={32}
              ring={palette.card}
            />
            <Txt
              variant="credit"
              multiline
              color={palette.creditText}
              style={{ ...typeAt('body', 14.5, 20.3, fontLocale), flex: 1 }}
            >
              {potLine(t, state, me)}
            </Txt>
          </View>
          <Txt
            variant="caption"
            multiline
            color={palette.body}
            style={typeAt('caption', 13.5, 19.6, fontLocale)}
          >
            {porchFrozen(state) ? t('fieldGuide.pot.frozen') : t('fieldGuide.pot.note')}
          </Txt>
          <LinkRow
            icon="photo"
            title={t('fieldGuide.pot.scrapbook')}
            sub={
              pressed > 0
                ? t('fieldGuide.pot.pressed', {
                    count: pressed,
                    number:
                      language === 'en'
                        ? capitalWord(numberWord(t, pressed))
                        : numberWord(t, pressed),
                  })
                : t('fieldGuide.pot.pressedNone')
            }
            onPress={() => router.push(fieldGuideRoutes.porchScrapbook(visit))}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const capitalWord = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
