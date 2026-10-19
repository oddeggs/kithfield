import type { Species } from '@kithfield/contracts';
import { day, radii } from '@kithfield/theme';
import { createElement } from 'react';
import { TextInput, View } from 'react-native';

import { Avatar } from '../../ui/art/avatar';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';

/** The critters the panel offers, as the design lines them up. */
export const JOIN_SPECIES: readonly Species[] = ['fox', 'duck', 'cat', 'bear', 'otter', 'mouse'];

const AVATAR = 48;

/** The row of critters to be: the chosen one ringed in ink. */
export function CritterRow({
  chosen,
  onChoose,
}: {
  readonly chosen: Species;
  readonly onChoose: (species: Species) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {JOIN_SPECIES.map((species) => {
        const on = species === chosen;
        const name = t(`onboardingCritters.${species}.name`);
        return (
          <Press
            key={species}
            onPress={() => onChoose(species)}
            radius={AVATAR / 2}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t('platforms.join.be', { critter: name })}
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              boxShadow: on
                ? `0 0 0 2.5px ${palette.sheet}, 0 0 0 4.5px ${palette.text}`
                : `0 0 0 1px ${palette.hairline}`,
            }}
          >
            <Avatar kind={species} size={AVATAR} />
          </Press>
        );
      })}
    </View>
  );
}

/** "Your name" with the name typed on the right, as the design sets the field. */
export function NameField({
  value,
  onChange,
  onSubmit,
}: {
  readonly value: string;
  readonly onChange: (name: string) => void;
  readonly onSubmit: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View
      style={{
        height: 50,
        borderRadius: radii.field,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
      }}
    >
      <Txt variant="body" color={palette.body}>
        {t('platforms.join.name')}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        maxLength={40}
        autoComplete="nickname"
        accessibilityLabel={t('platforms.join.name')}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'right',
          fontSize: 15,
          fontWeight: '600',
          color: palette.text,
          outlineWidth: 0,
        }}
      />
    </View>
  );
}

/** A plain list of years for the age check: the browser's own select, keyboard and all. */
export function YearSelect({
  value,
  onChange,
}: {
  readonly value: number | null;
  readonly onChange: (year: number) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const now = new Date().getFullYear();
  const years = Array.from({ length: now - 1900 + 1 }, (_, i) => now - i);
  return createElement(
    'select',
    {
      value: value ?? '',
      'aria-label': t('platforms.join.year'),
      onChange: (e: { target: { value: string } }) => onChange(Number(e.target.value)),
      style: {
        height: 50,
        borderRadius: radii.field,
        border: `1px solid ${palette.cardBorder}`,
        background: palette.card,
        color: value === null ? palette.placeholder : palette.text,
        padding: '0 14px',
        font: '600 15px -apple-system, system-ui, sans-serif',
      },
    },
    createElement('option', { value: '', disabled: true }, t('platforms.join.year')),
    ...years.map((y) => createElement('option', { key: y, value: y }, String(y))),
  );
}

/** The panel's words above the choices. */
export function PanelHead({ title, body }: { readonly title: string; readonly body: string }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <Txt variant="handS" color={day.moss} style={{ fontSize: 17, lineHeight: 17 }}>
        {t('platforms.join.hello')}
      </Txt>
      <Txt variant="displayM" style={{ fontSize: 30, lineHeight: 33 }}>
        {title}
      </Txt>
      <Txt variant="body" color={palette.body}>
        {body}
      </Txt>
    </View>
  );
}

/** The panel's foot: the one button, and the line under it. */
export function PanelFoot({
  label,
  onPress,
  busy,
  note,
  error,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly busy: boolean;
  readonly note: string;
  readonly error: string | null;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ marginTop: 'auto', gap: 14 }}>
      {error ? (
        <Txt variant="caption" color={day.clay} align="center">
          {error}
        </Txt>
      ) : null}
      <Button label={label} onPress={onPress} disabled={busy} haptic="tap" />
      <Txt variant="caption" color={palette.secondary} align="center">
        {note}
      </Txt>
    </View>
  );
}
