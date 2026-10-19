import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { timing, TravelAnchor, travelIds, useTravel } from '../../../ui/travel';
import { Txt } from '../../../ui/type/text';
import { crittersShaped, kindOf, pickSpecies, SHAPES, type Shape } from '../critters';
import { routes } from '../flow';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import { useRing } from '../fades';
import { BottomBar, StepDots, Title, TopBar, useDesignTop, useSceneAttrs } from '../kit';

/** A shape filter: small, ink when chosen. */
function ShapeChip({
  label,
  on,
  onPress,
}: {
  readonly label: string;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Press
      onPress={onPress}
      haptic="select"
      radius={16}
      hitSlop={6}
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={{
        minHeight: 32,
        paddingHorizontal: 13,
        borderRadius: 16,
        justifyContent: 'center',
        backgroundColor: on ? palette.chip.selectedBg : palette.card,
        borderWidth: 1,
        borderColor: palette.chip.border,
      }}
    >
      <Txt variant="segment" color={on ? palette.chip.selectedFg : palette.text}>
        {label}
      </Txt>
    </Press>
  );
}

/** The critter as it carries to the stage, and the share of the stage it lands at. */
const CARRIED = 120;
const CARRIED_FIT = 0.45;

/** Who are you on the farm: sixteen critters on a stage, filtered by shape. */
export function CritterScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const { state, update } = useFlow();
  const [shape, setShape] = useState<Shape | 'all'>('all');
  const choice = state.choice;
  const kind = kindOf(choice.species);
  const stageWidth = width - 56;
  const tileWidth = (width - 40 - 24) / 4;
  const ring = useRing();
  const travel = useTravel();
  // The picked critter carries from its tile up to the stage and grows there (signature motion).
  const pick = (species: Parameters<typeof pickSpecies>[1]) => {
    update({ choice: pickSpecies(choice, species) });
    if (species === choice.species) return;
    travel.fly({
      from: travelIds.pickerTile(species),
      to: travelIds.pickerStage,
      sprite: { critter: species, size: CARRIED },
      becomes: {
        scene: 'stage',
        attrs: { ...scene, kind: species },
        width: stageWidth,
        height: 196,
      },
      startFit: 1,
      fit: CARRIED_FIT,
      grow: 0.25,
      arc: 40,
      hideSource: false,
      durationMs: timing('pickerToFarm', 'carry'),
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar onBack={() => router.back()} inset={20} center={<StepDots step={1} />} />
      <View style={{ position: 'absolute', top: top(112), left: 24, right: 24 }}>
        <Title size={26}>{t('onboarding.critter.title')}</Title>
      </View>
      <View
        style={{
          position: 'absolute',
          top: top(154),
          left: 28,
          right: 28,
          height: 196,
          borderTopLeftRadius: 98,
          borderTopRightRadius: 98,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
          backgroundColor: kind.tint,
          overflow: 'hidden',
        }}
      >
        <TravelAnchor id={travelIds.pickerStage}>
          <SceneArt
            scene="stage"
            width={stageWidth}
            height={196}
            attrs={{ ...scene, kind: choice.species }}
          />
        </TravelAnchor>
        <View
          style={{
            position: 'absolute',
            right: 14,
            bottom: 12,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: 12,
            backgroundColor: 'rgba(251,247,240,.9)',
          }}
        >
          <Txt
            variant="label"
            color="#6b5f55"
            style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.66 }}
          >
            {t(`onboardingCritters.shape.${kind.shape}`)}
          </Txt>
        </View>
      </View>
      <View
        style={{
          position: 'absolute',
          top: top(362),
          left: 24,
          right: 24,
          gap: 4,
          alignItems: 'center',
        }}
      >
        <Txt variant="displayM" align="center" style={{ fontSize: 22, lineHeight: 24.2 }}>
          {t(`onboardingCritters.${choice.species}.name`)}
        </Txt>
        <Txt
          variant="caption"
          multiline
          align="center"
          color={palette.body}
          style={{ fontSize: 14.5, lineHeight: 19.6 }}
        >
          {t(`onboardingCritters.${choice.species}.line`)}
        </Txt>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          position: 'absolute',
          top: top(428),
          left: 0,
          right: 0,
          height: 32,
          overflow: 'visible',
        }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
      >
        {(['all', ...SHAPES] as const).map((s) => (
          <ShapeChip
            key={s}
            label={t(`onboardingCritters.shape.${s}`)}
            on={shape === s}
            onPress={() => setShape(s)}
          />
        ))}
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          top: top(474),
          left: 20,
          right: 20,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {crittersShaped(shape).map((c) => {
          const on = c.species === choice.species;
          return (
            <Press
              key={c.species}
              onPress={() => pick(c.species)}
              haptic="select"
              radius={16}
              accessibilityLabel={t(`onboardingCritters.${c.species}.name`)}
              accessibilityState={{ selected: on }}
              style={{
                width: tileWidth,
                height: 62,
                borderRadius: 16,
                backgroundColor: c.tint,
                boxShadow: ring(on, '0 0 0 1px rgba(42,34,29,.08)'),
              }}
            >
              <TravelAnchor
                id={travelIds.pickerTile(c.species)}
                style={{ width: tileWidth, height: 62, borderRadius: 16, overflow: 'hidden' }}
              >
                <ArtStill
                  scene="stage"
                  width={tileWidth}
                  height={62}
                  attrs={{ ...scene, kind: c.species }}
                  t={1.2}
                />
              </TravelAnchor>
            </Press>
          );
        })}
      </View>
      <BottomBar>
        <Button label={t('onboarding.critter.next')} onPress={() => router.push(routes.look)} />
      </BottomBar>
    </View>
  );
}
