import type { LocalDate } from '@kithfield/contracts';
import { motion, springFromResponse } from '@kithfield/theme';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { formatDay, weekdayName, weekdayShort, weekOf } from './dates';
import type { PlanPerson } from './people';
import { Critters } from './plan-sections';
import { sunPatch, usePlanLook } from './plan-look';

/** A bud starts this big and grows this much per friend leaning on it. */
const BUD_BASE = 64;
const BUD_PER_VOTE = 14;
const BUD_MAX = 148;
/** The buds' spring: 240 ms, as damped as every other spring. */
const BUD_SPRING = springFromResponse(0.24, motion.sheet.dampingFraction);

/**
 * A day option as a bud: tap to lean on it, tap again to take it back. It grows with each friend
 * who leans on it, on a spring on the UI thread (a plain resize under Reduce Motion).
 */
export function VoteBud({
  label,
  voters,
  mine,
  onPress,
}: {
  readonly label: string;
  readonly voters: readonly PlanPerson[];
  readonly mine: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const look = usePlanLook();
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const target = Math.min(BUD_MAX, BUD_BASE + voters.length * BUD_PER_VOTE);
  const size = useSharedValue(target);
  useEffect(() => {
    size.set(reduce ? target : withSpring(target, BUD_SPRING));
  }, [target, reduce, size]);
  const box = useAnimatedStyle(() => ({ width: size.get(), height: size.get() }));
  const art = useAnimatedStyle(() => {
    const s = size.get();
    return {
      transform: [
        { translateX: (s - BUD_MAX) / 2 },
        { translateY: (s - BUD_MAX) / 2 },
        { scale: s / BUD_MAX },
      ],
    };
  });
  return (
    <Press
      onPress={onPress}
      haptic="select"
      radius={26}
      accessibilityLabel={t('plans.vote.lean', { day: label })}
      accessibilityState={{ selected: mine }}
      style={{
        flex: 1,
        // The design's 236 is its content box: 250 tall with the padding under the critters.
        minHeight: 250,
        borderRadius: 26,
        backgroundColor: look.bud,
        boxShadow: `0 0 0 1px ${palette.cardBorder}${mine ? `, 0 0 0 3px ${palette.go.bg}` : ''}`,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 14,
        gap: 8,
      }}
    >
      <Animated.View style={[box, { overflow: 'visible' }]}>
        <Animated.View style={[{ width: BUD_MAX, height: BUD_MAX }, art]}>
          <ArtStill scene="seed" width={BUD_MAX} height={BUD_MAX} attrs={{ stage: 2 }} />
        </Animated.View>
      </Animated.View>
      <Txt variant="displayS" style={{ fontSize: 20, lineHeight: 24, marginVertical: -2 }}>
        {label}
      </Txt>
      <View style={{ height: 24 }}>
        <Critters people={voters} size={24} ring={look.bud} overlap={5} />
      </View>
    </Press>
  );
}

/**
 * The sun patch: the week of the plan's days, with the day most people lean on in full
 * sun, the other days on offer warm, and the rest of the week plain.
 */
export function SunPatch({
  options,
  leading,
}: {
  readonly options: readonly LocalDate[];
  readonly leading: readonly LocalDate[];
}) {
  const { t } = useLocale();
  const first = [...options].sort()[0];
  if (first === undefined) return null;
  const week = weekOf(first);
  const summary =
    leading.length === 0
      ? t('plans.sun.none')
      : leading.length === 1
        ? t('plans.sun.leading', { day: weekdayName(t, leading[0] ?? first) })
        : t('plans.sun.tied', {
            first: weekdayName(t, leading[0] ?? first),
            second: weekdayName(t, leading[1] ?? first),
          });
  return (
    <View
      style={{
        borderRadius: 26,
        backgroundColor: sunPatch.bg,
        paddingTop: 14,
        paddingHorizontal: 14,
        paddingBottom: 16,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Txt variant="displayS" color={sunPatch.text} style={{ fontSize: 20, lineHeight: 24 }}>
          {t('plans.sun.title')}
        </Txt>
        <Txt variant="handS" color={sunPatch.eyebrow} style={{ lineHeight: 16.5 }}>
          {t('plans.sun.eyebrow', { day: formatDay(t, week[0] ?? first) })}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {week.map((day) => {
          const best = leading.includes(day);
          const warm = !best && options.includes(day);
          return (
            <View
              key={day}
              accessible
              accessibilityLabel={weekdayName(t, day)}
              accessibilityState={{ selected: best }}
              style={{
                flex: 1,
                minHeight: 78,
                borderRadius: 14,
                backgroundColor: best ? sunPatch.best : warm ? sunPatch.warm : sunPatch.empty,
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 8,
              }}
            >
              <Txt
                variant="bubbleName"
                color={best ? sunPatch.bestText : sunPatch.text}
              >
                {weekdayShort(t, day)}
              </Txt>
              {best ? (
                <ArtIcon name="sun" size={30} color={sunPatch.bestText} />
              ) : warm ? (
                <ArtIcon name="sun" size={22} color={sunPatch.text} style={{ opacity: 0.7 }} />
              ) : (
                <View />
              )}
            </View>
          );
        })}
      </View>
      <Txt variant="notice" multiline color={sunPatch.body} style={{ lineHeight: 19.2 }}>
        {summary}
      </Txt>
    </View>
  );
}
