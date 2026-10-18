import type { Translate } from '@kithfield/i18n';
import { View } from 'react-native';

import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { formatDay, formatDays, formatTime } from './dates';
import type { PlanPerson } from './people';
import { Critters } from './plan-sections';
import { usePlanLook } from './plan-look';
import { inPhraseKey, needsKey, planTime, type BedEntry } from './plan-status';
import { SeedArt } from './seed-art';

/** "Sat 24 Oct · Willow bend, from 4pm", or as much of it as the plan has. */
export function planDetail(
  t: Translate,
  entry: Pick<BedEntry, 'seed' | 'day'>,
  options: { short?: boolean } = {},
): string {
  const { seed, day } = entry;
  const name = seed.place?.name ?? null;
  // A card names the place's first part ("Willow bend"); the plan itself names all of it.
  const place = name !== null && options.short ? (name.split(',')[0] ?? name).trim() : name;
  const time = planTime(seed, day);
  if (day === null) {
    if (seed.days.length > 1) return formatDays(t, seed.days.map((d) => d.date)).join(' · ');
    return place ?? '';
  }
  const dayText = formatDay(t, day);
  if (place === null) return time ? t('plans.detail.dayTime', { day: dayText, time: formatTime(t, time) }) : dayText;
  return time
    ? t('plans.detail.dayPlaceTime', { day: dayText, place, time: formatTime(t, time) })
    : t('plans.detail.dayPlace', { day: dayText, place });
}

/** The sprouted plan, in honey: who's in, and a way into the calendar. */
function SproutedCard({
  entry,
  people,
  onPress,
  onCalendar,
}: {
  readonly entry: BedEntry;
  readonly people: readonly PlanPerson[];
  readonly onPress: () => void;
  readonly onCalendar: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const p = palette.plan;
  const today = entry.kind === 'today';
  return (
    <View
      style={{
        borderRadius: 24,
        backgroundColor: p.bg,
        borderWidth: 1,
        borderColor: p.border,
        padding: 14,
        gap: 12,
      }}
    >
      <Press
        onPress={onPress}
        darken={false}
        accessibilityLabel={`${entry.seed.title ?? ''}, ${planDetail(t, entry)}`}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
      >
        <SeedArt stage={3} size={68} tile={p.art} radius={18} twinkle />
        <View style={{ flex: 1 }}>
          <Txt variant="handS" color={p.eyebrow} style={{ fontSize: 16, lineHeight: 16 }}>
            {t(today ? 'plans.bed.today' : 'plans.bed.sprouted')}
          </Txt>
          <Txt variant="rowTitle" style={{ fontSize: 17, lineHeight: 20.4, marginTop: 2 }}>
            {entry.seed.title}
          </Txt>
          <Txt variant="caption" color={p.detail} style={{ lineHeight: 17.55 }}>
            {planDetail(t, entry, { short: true })}
          </Txt>
        </View>
      </Press>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          {people.length > 0 ? <Critters people={people} size={26} ring={p.bg} overlap={7} /> : null}
          <Txt variant="caption" color={p.detail} numberOfLines={1} style={{ fontSize: 13, lineHeight: 13, flexShrink: 1 }}>
            {t(inPhraseKey(entry.seed.yeses))}
          </Txt>
        </View>
        {entry.day !== null ? (
          <Press
            onPress={onCalendar}
            radius={16}
            hitSlop={6}
            accessibilityLabel={t('plans.bed.addToCalendar')}
            style={{
              height: 32,
              paddingHorizontal: 12,
              borderRadius: 16,
              justifyContent: 'center',
              backgroundColor: palette.primary.bg,
            }}
          >
            <Txt variant="buttonSmall" color={palette.primary.fg} style={{ fontSize: 13, lineHeight: 13 }}>
              {t('plans.bed.addToCalendar')}
            </Txt>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

/** A plan still growing, one that needs something, or a seed resting in the shed. */
function GrowingCard({ entry, onPress }: { readonly entry: BedEntry; readonly onPress: () => void }) {
  const { palette } = useTheme();
  const look = usePlanLook();
  const { t } = useLocale();
  const resting = entry.kind === 'someday';
  const title = resting ? t('plans.bed.someday', { title: entry.seed.title ?? '' }) : (entry.seed.title ?? '');
  const detail =
    entry.kind === 'needs'
      ? t(needsKey(entry.conditions))
      : resting
        ? t('plans.bed.resting')
        : planDetail(t, entry, { short: true });
  const hand =
    entry.kind === 'growing' ? t('plans.bed.waitingYeses') : entry.kind === 'picking' ? t('plans.bed.picking') : null;
  const suggest =
    entry.kind === 'needs' ? t(entry.conditions.day ? 'plans.bed.suggestPlace' : 'plans.bed.suggestDay') : null;
  return (
    <Press
      onPress={onPress}
      radius={24}
      accessibilityLabel={`${title}, ${detail}`}
      style={[
        { borderRadius: 24, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
        resting
          ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: look.restingBorder }
          : { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.cardBorder },
      ]}
    >
      <SeedArt
        stage={resting ? 0 : entry.stage}
        size={60}
        tile={resting ? look.restingTile : look.seedTile}
        radius={16}
        dim={resting}
      />
      <View style={{ flex: 1 }}>
        <Txt variant="rowTitle" color={resting ? look.restingTitle : palette.text} style={{ lineHeight: 19.2 }}>
          {title}
        </Txt>
        <Txt variant="caption" color={palette.secondary} style={{ lineHeight: 17.55 }}>
          {detail}
        </Txt>
        {hand ? (
          <Txt variant="handS" color={look.hand} style={{ marginTop: 5 }}>
            {hand}
          </Txt>
        ) : null}
        {suggest ? (
          <View style={{ flexDirection: 'row', marginTop: 7 }}>
            <View
              style={{
                height: 24,
                paddingHorizontal: 9,
                borderRadius: 12,
                justifyContent: 'center',
                backgroundColor: palette.chip.suggestionBg,
              }}
            >
              <Txt variant="segment" color={palette.chip.suggestionFg} style={{ fontSize: 12, lineHeight: 12 }}>
                {suggest}
              </Txt>
            </View>
          </View>
        ) : null}
      </View>
    </Press>
  );
}

/** A plan in the seed bed, drawn by where it stands. */
export function SeedCard(props: {
  readonly entry: BedEntry;
  readonly people: readonly PlanPerson[];
  readonly onPress: () => void;
  readonly onCalendar: () => void;
}) {
  const { kind } = props.entry;
  if (kind === 'sprouted' || kind === 'today') return <SproutedCard {...props} />;
  return <GrowingCard entry={props.entry} onPress={props.onPress} />;
}
