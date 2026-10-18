import type { LocalDate, Yeses } from '@kithfield/contracts';
import { fontFor } from '@kithfield/theme';
import { useState, type ReactNode } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { Chip } from '../../ui/components/chip';
import { Segmented } from '../../ui/components/segmented';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { componentType } from '../../ui/type/styles';
import { Txt } from '../../ui/type/text';
import { formatDay, formatDays, fortnight, weekendChoices } from './dates';
import { joinNames } from './draft';
import type { PlanPerson } from './people';
import { usePlanLook } from './plan-look';

/* The three things a plan needs, as the plant sheet asks for them. */

/** A condition's card: its check, its name and the controls that meet it. */
export function ConditionCard({
  title,
  met,
  children,
}: {
  readonly title: string;
  readonly met: boolean;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  const look = usePlanLook();
  return (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 10,
      }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        accessible
        accessibilityRole="header"
        accessibilityLabel={title}
        accessibilityState={{ checked: met }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: palette.go.bg,
            backgroundColor: met ? palette.go.bg : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {met ? <ArtIcon name="check" size={11} color={look.check} /> : null}
        </View>
        <Txt variant="rowTitle" style={{ fontSize: 15, lineHeight: 15 }}>
          {title}
        </Txt>
      </View>
      {children}
    </View>
  );
}

/** Day chips: the coming weekend, the one after, or any day of the next two weeks. */
export function DayChoices({
  today,
  days,
  onChange,
}: {
  readonly today: LocalDate;
  readonly days: readonly LocalDate[];
  readonly onChange: (days: LocalDate[]) => void;
}) {
  const { t } = useLocale();
  const [picking, setPicking] = useState(false);
  const { saturday, sunday, nextSaturday } = weekendChoices(today);
  const toggle = (day: LocalDate) =>
    onChange(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort());
  const quick = [saturday, sunday, nextSaturday];
  const [satLabel = '', sunLabel = ''] = formatDays(t, [saturday, sunday]);
  const labels = [satLabel, sunLabel, t('plans.day.nextWeekend')];
  const own = days.filter((d) => !quick.includes(d));
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {quick.map((day, i) => (
          <Chip
            key={day}
            label={labels[i] ?? ''}
            kind={days.includes(day) ? 'selected' : 'default'}
            onPress={() => toggle(day)}
          />
        ))}
        {own.map((day) => (
          <Chip key={day} label={formatDay(t, day)} kind="selected" onPress={() => toggle(day)} />
        ))}
        <Chip
          label={t('plans.day.pick')}
          kind={picking ? 'selected' : 'default'}
          onPress={() => setPicking((p) => !p)}
        />
      </View>
      {picking ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {fortnight(today).map((day) => (
            <Chip
              key={day}
              label={formatDay(t, day, false)}
              kind={days.includes(day) ? 'selected' : 'default'}
              onPress={() => toggle(day)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** A place typed in, with places the farm has planned at before one tap away. */
export function PlaceChoice({
  value,
  onChange,
  suggestions,
}: {
  readonly value: string;
  readonly onChange: (place: string) => void;
  readonly suggestions: readonly string[];
}) {
  const { palette, appearance } = useTheme();
  const { t, fontLocale } = useLocale();
  const field = fontFor(componentType.fieldText, fontLocale);
  return (
    <View style={{ gap: 10 }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('plans.place.placeholder')}
        placeholderTextColor={palette.placeholder}
        selectionColor={palette.go.bg}
        accessibilityLabel={t('plans.place.title')}
        returnKeyType="done"
        maxLength={120}
        testID="plans-place"
        style={[
          field,
          {
            lineHeight: undefined,
            height: 40,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 0,
            backgroundColor: appearance === 'night' ? palette.fillSoft : palette.background,
            color: palette.text,
          },
        ]}
      />
      {suggestions.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map((s) => (
            <Press
              key={s}
              onPress={() => onChange(value === s ? '' : s)}
              haptic="select"
              radius={16}
              hitSlop={6}
              accessibilityLabel={s}
              accessibilityState={{ selected: value === s }}
              style={{
                height: 32,
                paddingHorizontal: 12,
                borderRadius: 16,
                justifyContent: 'center',
                backgroundColor: palette.chip.suggestionBg,
              }}
            >
              <Txt
                variant="chip"
                medium
                color={palette.chip.suggestionFg}
                style={{ fontSize: 13.5, lineHeight: 13.5 }}
                numberOfLines={1}
              >
                {s}
              </Txt>
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** How many yeses the plan needs, and who is in so far. */
export function YesesChoice({
  value,
  onChange,
  inSoFar,
}: {
  readonly value: Yeses;
  readonly onChange: (yeses: Yeses) => void;
  readonly inSoFar: readonly PlanPerson[];
}) {
  const { t } = useLocale();
  return (
    <View style={{ gap: 10 }}>
      <Segmented
        label={t('plans.yeses.title')}
        value={value}
        onChange={onChange}
        segments={[
          { value: 'couple', label: t('plans.yeses.couple') },
          { value: 'most', label: t('plans.yeses.most') },
          { value: 'everyone', label: t('plans.yeses.everyone') },
        ]}
      />
      <InSoFar people={inSoFar} />
    </View>
  );
}

/** "Pip and you are in so far", with their critters. */
export function InSoFar({ people }: { readonly people: readonly PlanPerson[] }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const others = people.filter((p) => !p.you).map((p) => p.name);
  const you = people.some((p) => p.you);
  const line =
    people.length === 0
      ? t('plans.yeses.nobodyYet')
      : others.length === 0
        ? t('plans.yeses.youInSoFar')
        : t('plans.yeses.inSoFar', {
            names: joinNames(t, you ? [...others, t('plans.people.you')] : others),
          });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {people.length > 0 ? <Critters people={people} size={24} ring={palette.card} /> : null}
      <Txt
        variant="caption"
        color={palette.secondary}
        style={{ flex: 1, lineHeight: 13.5 }}
        numberOfLines={2}
      >
        {line}
      </Txt>
    </View>
  );
}

/** Overlapping critters, each ringed in the surface colour. */
export function Critters({
  people,
  size,
  ring,
  overlap = size / 4,
}: {
  readonly people: readonly PlanPerson[];
  readonly size: number;
  readonly ring: string;
  readonly overlap?: number;
}) {
  return (
    <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
      {people.map((p, i) => (
        <Avatar
          key={p.person}
          kind={p.kind}
          look={p.look}
          size={size}
          ring={ring}
          style={i > 0 ? { marginLeft: -overlap } : null}
        />
      ))}
    </View>
  );
}
