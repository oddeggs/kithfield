import type { FarmId, PersonId, SeedState } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useOpenFarm } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { leave, PlanHeader, useBottomButtonOffset, useFromTop } from './chrome';
import { personOn, type PlanPerson } from './people';
import { organiserHat, usePlanLook } from './plan-look';
import { answerSeenBy, canPassHat } from './plan-status';
import { useMe, usePlan, usePlanRejections, usePlanSend } from './use-plans';

/** How high the hat-wearer hops when the hat arrives, for one drawing on twos. */
const HOP = 12;

type Answer = SeedState['rsvps'][number]['answer'] | null;
const ORDER = { in: 0, maybe: 1, out: 2, none: 3 } as const;

/**
 * The hat-wearer's critter with the hat on, hopping once when the hat passes to them. The stage is
 * a still: at this size a breathing loop would take more of the art cache than a loop may.
 */
function HatStage({
  wearer,
  season,
  top,
}: {
  readonly wearer: PlanPerson;
  readonly season: string;
  readonly top: number;
}) {
  const look = usePlanLook();
  const reduce = useReduceMotion();
  const y = useSharedValue(0);
  const last = useRef(wearer.person);
  useEffect(() => {
    if (last.current === wearer.person) return;
    last.current = wearer.person;
    if (reduce) return;
    const hold = motion.twos.frameMs;
    y.set(withSequence(withTiming(-HOP, { duration: 0 }), withDelay(hold, withTiming(0, { duration: 0 }))));
  }, [wearer.person, reduce, y]);
  const hop = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <View
      style={{
        position: 'absolute',
        top,
        left: 28,
        right: 28,
        height: 230,
        borderTopLeftRadius: 115,
        borderTopRightRadius: 115,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        backgroundColor: look.hatStage,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={hop}>
        <ArtStill
          scene="stage"
          width={337}
          height={230}
          attrs={{
            kind: wearer.kind,
            season,
            outfit: organiserHat.outfit,
            ocolor: organiserHat.band,
            ...(wearer.look.coat ? { coat: wearer.look.coat } : {}),
            ...(wearer.look.mark ? { mark: wearer.look.mark } : {}),
          }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The organiser's hat: whoever wears it gets the gentle follow-ups for missing answers, so
 * nobody has to chase friends. Every member's answer, and the hat passed on with a tap.
 */
export function RepliesScreen({ farm, seq }: { readonly farm: FarmId; readonly seq: number }) {
  useOpenFarm(farm);
  usePlanRejections();
  const { palette } = useTheme();
  const look = usePlanLook();
  const { t } = useLocale();
  const offset = useBottomButtonOffset();
  const fromTop = useFromTop();
  const me = useMe();
  const send = usePlanSend(farm);
  const here = usePlan(farm, seq);
  const [passing, setPassing] = useState(false);
  const plan = here?.plan;
  if (!here || !plan) return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  const { state } = here;
  const { seed } = plan;
  const wearer = personOn(state, seed.hat, me, t);
  const canPass = canPassHat(seed, me);
  const wearsHat = me !== null && me === seed.hat;
  const answerOf = (p: PersonId): Answer =>
    answerSeenBy(seed.rsvps.find((r) => r.person === p)?.answer ?? null, wearsHat);
  // The hat-wearer follows up on everyone else's answers; passing the hat lists everyone else too.
  const rows = state.members
    .filter((m) => m.person !== seed.hat)
    .map((m) => ({ who: personOn(state, m.person, me, t), answer: answerOf(m.person) }))
    .sort((a, b) => ORDER[a.answer ?? 'none'] - ORDER[b.answer ?? 'none']);
  const pass = (to: PersonId) => {
    setPassing(false);
    if (to !== seed.hat) void send('seed_changed', { seed: seed.seq, hat: to });
  };
  const words = (answer: Answer) =>
    answer === 'in'
      ? { text: t('plans.hat.in'), color: look.hand }
      : answer === 'maybe'
        ? { text: t('plans.hat.maybe'), color: look.maybe }
        : answer === 'out'
          ? { text: t('plans.hat.out'), color: look.waiting }
          : { text: t('plans.hat.waiting'), color: look.waiting };
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <PlanHeader title={t('plans.hat.screen', { plan: seed.title ?? '' })} top={fromTop(56)} />
      <HatStage wearer={wearer} season={state.season.season} top={fromTop(112)} />
      <ScrollView
        contentContainerStyle={{ paddingTop: fromTop(356), paddingBottom: offset + 56 + 20 }}
      >
        <View style={{ paddingHorizontal: 22, gap: 6 }}>
          <Txt variant="displayM" multiline style={{ fontSize: 24, lineHeight: 26.4 }}>
            {passing
              ? t('plans.hat.choose')
              : wearer.you
                ? t('plans.hat.titleYou')
                : t('plans.hat.title', { name: wearer.name })}
          </Txt>
          <Txt variant="body" multiline color={palette.body} style={{ lineHeight: 21.3 }}>
            {wearer.you
              ? t('plans.hat.bodyYou', { plan: seed.title ?? '' })
              : t('plans.hat.body', { plan: seed.title ?? '', name: wearer.name })}
          </Txt>
        </View>
        <View
          style={{
            marginTop: 39,
            marginHorizontal: 16,
            borderRadius: 22,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            overflow: 'hidden',
          }}
        >
          {rows.map(({ who, answer }, i) => {
            const w = words(answer);
            const row = (
              <>
                <Avatar kind={who.kind} look={who.look} size={32} />
                <Txt variant="rowTitle" style={{ flex: 1, fontSize: 15 }}>
                  {who.you ? t('plans.hat.you') : who.name}
                </Txt>
                <Txt variant="handS" color={w.color}>
                  {w.text}
                </Txt>
              </>
            );
            const style = {
              flexDirection: 'row' as const,
              alignItems: 'center' as const,
              gap: 10,
              paddingVertical: 9,
              paddingHorizontal: 14,
              ...(i > 0 ? { borderTopWidth: 1, borderTopColor: palette.hairline } : {}),
            };
            return passing ? (
              <Press
                key={who.person}
                onPress={() => pass(who.person)}
                haptic="select"
                accessibilityLabel={t('plans.hat.passTo', { name: who.name })}
                style={style}
              >
                {row}
              </Press>
            ) : (
              <View key={who.person} style={style} accessible>
                {row}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: offset,
          flexDirection: 'row',
          gap: 10,
          backgroundColor: palette.background,
        }}
      >
        {canPass ? (
          <Button
            label={passing ? t('plans.hat.keep') : t('plans.hat.pass')}
            kind="secondary"
            icon="hat"
            onPress={() => setPassing((p) => !p)}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button label={t('plans.hat.looksGood')} onPress={() => leave()} style={{ flex: 1.2 }} />
      </View>
    </View>
  );
}
