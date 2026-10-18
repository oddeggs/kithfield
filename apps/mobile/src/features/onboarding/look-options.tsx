import { View } from 'react-native';

import { Avatar } from '../../ui/art/avatar';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { ACCESSORIES, critterOf, kindOf, lookOf, MARKS, type CritterChoice } from './critters';
import { useRing } from './fades';

/** The coats of this critter, as swatches with their names. */
export function CoatOptions({
  choice,
  onChange,
}: {
  readonly choice: CritterChoice;
  readonly onChange: (choice: CritterChoice) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const ring = useRing();
  return (
    <View style={{ flexDirection: 'row', gap: 16, paddingTop: 6 }}>
      {kindOf(choice.species).coats.map((coat) => {
        const on = coat.id === choice.coat;
        const label = t(`onboardingCritters.coat.${coat.label}`);
        return (
          <Press
            key={coat.id}
            onPress={() => onChange({ ...choice, coat: coat.id })}
            haptic="select"
            darken={false}
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            style={{ alignItems: 'center', gap: 6 }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: coat.swatch,
                boxShadow: ring(on),
              }}
            />
            <Txt variant="code" color={palette.body}>
              {label}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** The markings, as chips. */
export function MarkOptions({
  choice,
  onChange,
}: {
  readonly choice: CritterChoice;
  readonly onChange: (choice: CritterChoice) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6 }}>
      {MARKS.map((mark) => {
        const on = mark === choice.mark;
        const label = t(`onboardingCritters.mark.${mark}`);
        return (
          <Press
            key={mark}
            onPress={() => onChange({ ...choice, mark })}
            haptic="select"
            radius={18}
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            style={{
              height: 36,
              paddingHorizontal: 14,
              borderRadius: 18,
              justifyContent: 'center',
              backgroundColor: on ? palette.chip.selectedBg : palette.card,
              borderWidth: 1,
              borderColor: palette.chip.border,
            }}
          >
            <Txt variant="chip" medium color={on ? palette.chip.selectedFg : palette.text}>
              {label}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** The accessories, each tried on the critter in its coat. */
export function AccessoryOptions({
  choice,
  onChange,
  width,
}: {
  readonly choice: CritterChoice;
  readonly onChange: (choice: CritterChoice) => void;
  /** The width the five columns share. */
  readonly width: number;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const ring = useRing();
  const column = (width - 6 * 4) / 5;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 10 }}>
      {ACCESSORIES.map((accessory) => {
        const on = accessory === choice.accessory;
        const label = t(`onboardingCritters.accessory.${accessory}`);
        const worn = critterOf({ ...choice, mark: 'none', accessory });
        return (
          <Press
            key={accessory}
            onPress={() => onChange({ ...choice, accessory })}
            haptic="select"
            darken={false}
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            style={{ width: column, alignItems: 'center', gap: 5 }}
          >
            <Avatar
              kind={choice.species}
              look={lookOf(worn)}
              size={52}
              style={{ boxShadow: ring(on) }}
            />
            <Txt variant="note" color={palette.body}>
              {label}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}
