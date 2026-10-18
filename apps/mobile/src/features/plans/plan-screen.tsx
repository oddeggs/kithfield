import type { FarmId, FarmState, LocalDate, PersonId, SeedState } from '@kithfield/contracts';
import type { PlanView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useOpenFarm } from '../../data';
import { Button } from '../../ui/components/button';
import { Chip } from '../../ui/components/chip';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { formatDay, settleDayFor, weekdayName, weekdayShort } from './dates';
import { placeSuggestions } from './draft';
import { PlanHeader, useBottomButtonOffset, useFromTop } from './chrome';
import { personOn, youLast, type PlanPerson } from './people';
import { ConditionCard, DayChoices, InSoFar, PlaceChoice } from './plan-sections';
import { usePlanLook } from './plan-look';
import { canCheckIn, leadingOptions, peopleIn, stageOf, stillVoting, votersOf } from './plan-status';
import { SeedArt } from './seed-art';
import { planDetail } from './seed-card';
import { useMe, usePlan, usePlanRejections, usePlanSend, usePlantedAnswers } from './use-plans';
import { SunPatch, VoteBud } from './voting';

/** Where the design sets the header and the screen's question, from the top of the screen. */
const HEADER_TOP = 56;
const CONTENT_TOP = 116;
const STAGE_CAPTIONS = ['plans.stage.0', 'plans.stage.1', 'plans.stage.2', 'plans.stage.3'] as const;

type Send = (kind: string, payload: unknown) => Promise<boolean>;

/** "Are you in?": the person's own answer, changed with a tap. */
function Rsvp({ seed, me, send }: { seed: SeedState; me: PersonId | null; send: Send }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const mine = seed.rsvps.find((r) => r.person === me)?.answer ?? null;
  const answers = [
    ['in', 'plans.rsvp.in'],
    ['maybe', 'plans.rsvp.maybe'],
    ['out', 'plans.rsvp.out'],
  ] as const;
  return (
    <View style={{ gap: 10 }}>
      <Txt variant="label" color={palette.muted}>
        {t('plans.rsvp.title')}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {answers.map(([answer, key]) => (
          <Chip
            key={answer}
            label={t(key)}
            kind={mine === answer ? 'selected' : 'default'}
            onPress={() => void send('rsvp', { seed: seed.seq, answer })}
          />
        ))}
      </View>
    </View>
  );
}

/** Picking a day: a bud per day to lean on, and the sun patch of the week. */
function Voting({
  state,
  plan,
  today,
  me,
  send,
}: {
  state: FarmState;
  plan: PlanView;
  today: LocalDate;
  me: PersonId | null;
  send: Send;
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const { seed } = plan;
  const dates = seed.days.map((d) => d.date);
  const leading = leadingOptions(seed).map((i) => dates[i]).filter((d): d is LocalDate => !!d);
  const settle = seed.settleOn ?? settleDayFor(dates, today);
  const question =
    dates.length === 2
      ? t('plans.vote.question', {
          first: weekdayShort(t, dates[0] ?? today),
          second: weekdayShort(t, dates[1] ?? today),
        })
      : t('plans.vote.whichDay');
  const voters = (i: number): PlanPerson[] =>
    votersOf(seed, i).map((p) => personOn(state, p, me, t));
  return (
    <View>
      <View style={{ paddingHorizontal: 20, gap: 6 }}>
        <Txt variant="displayM" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 30.8 }}>
          {question}
        </Txt>
        <Txt variant="body" multiline color={palette.body} style={{ lineHeight: 21.3 }}>
          {settle
            ? t('plans.vote.lead', { weekday: weekdayName(t, settle) })
            : t('plans.vote.leadOpen')}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginTop: 5 }}>
        {dates.map((date, i) => {
          const people = voters(i);
          const mine = people.some((p) => p.you);
          return (
            <View key={date} style={{ width: '48.5%', flexGrow: 1 }}>
              <VoteBud
                label={formatDay(t, date, false)}
                voters={people}
                mine={mine}
                onPress={() => void send('vote', { seed: seed.seq, option: i, on: !mine })}
              />
            </View>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
        <SunPatch options={dates} leading={leading} />
      </View>
    </View>
  );
}

/** A plan that isn't being voted on: where it stands, and a way to give it what it needs. */
function Overview({
  state,
  plan,
  today,
  me,
  send,
}: {
  state: FarmState;
  plan: PlanView;
  today: LocalDate;
  me: PersonId | null;
  send: Send;
}) {
  const { palette } = useTheme();
  const look = usePlanLook();
  const { t } = useLocale();
  const { seed, conditions } = plan;
  const stage = stageOf(seed, conditions);
  const [days, setDays] = useState<LocalDate[]>([]);
  const [place, setPlace] = useState('');
  const people = youLast(peopleIn(seed).map((p) => personOn(state, p, me, t)));
  const day = seed.days.length === 1 ? (seed.days[0]?.date ?? null) : null;
  return (
    <View style={{ paddingHorizontal: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 }}>
        <SeedArt stage={stage} size={96} tile={look.seedTile} radius={24} twinkle />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="displayM" multiline style={{ fontSize: 25, lineHeight: 27.5 }}>
            {seed.title}
          </Txt>
          <Txt variant="caption" color={palette.secondary}>
            {planDetail(t, { seed, day })}
          </Txt>
          <Txt variant="handL" color={look.hand} style={{ fontSize: 17 }}>
            {t(STAGE_CAPTIONS[stage])}
          </Txt>
        </View>
      </View>
      {!conditions.day && seed.days.length === 0 ? (
        <ConditionCard title={t('plans.day.title')} met={false}>
          <DayChoices today={today} days={days} onChange={setDays} />
          <Button
            label={t('plans.plan.save')}
            kind="go"
            size="small"
            disabled={days.length === 0}
            onPress={() => void send('seed_changed', { seed: seed.seq, days: days.map((date) => ({ date })) })}
            style={{ alignSelf: 'flex-start' }}
          />
        </ConditionCard>
      ) : null}
      {!conditions.place ? (
        <ConditionCard title={t('plans.place.title')} met={false}>
          <PlaceChoice value={place} onChange={setPlace} suggestions={placeSuggestions(state.seeds)} />
          <Button
            label={t('plans.plan.save')}
            kind="go"
            size="small"
            disabled={place.trim() === ''}
            onPress={() =>
              void send('seed_changed', { seed: seed.seq, place: { name: place.trim().slice(0, 120) } })
            }
            style={{ alignSelf: 'flex-start' }}
          />
        </ConditionCard>
      ) : null}
      <ConditionCard title={t('plans.yeses.title')} met={conditions.yeses}>
        <InSoFar people={people} />
      </ConditionCard>
    </View>
  );
}

/**
 * A plan: while friends pick between days, the voting buds and the sun
 * patch; otherwise where the plan stands. Both end with the person's own answer and the replies.
 */
export function PlanScreen({ farm, seq }: { readonly farm: FarmId; readonly seq: number }) {
  useOpenFarm(farm);
  usePlanRejections();
  usePlantedAnswers();
  const { palette } = useTheme();
  const { t } = useLocale();
  const offset = useBottomButtonOffset();
  const fromTop = useFromTop();
  const me = useMe();
  const send = usePlanSend(farm);
  const here = usePlan(farm, seq);
  const plan = here?.plan ?? null;
  if (!here || !plan) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <PlanHeader title="" top={fromTop(HEADER_TOP)} />
        {here ? (
          <Txt variant="body" color={palette.secondary} style={{ marginTop: fromTop(CONTENT_TOP), marginHorizontal: 20 }}>
            {t('plans.plan.gone')}
          </Txt>
        ) : null}
      </View>
    );
  }
  const { state, view } = here;
  const { seed } = plan;
  const voting = stillVoting(seed, view.today);
  const canSettle = voting && seed.settleOn === null;
  const settle = settleDayFor(
    seed.days.map((d) => d.date),
    view.today,
  );
  const onTheDay = canCheckIn(seed, view.today);
  const bottom = canSettle || onTheDay;
  const params = { farm, seed: String(seq) };
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <PlanHeader title={seed.title ?? ''} top={fromTop(HEADER_TOP)} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: fromTop(CONTENT_TOP),
          paddingBottom: offset + (bottom ? 56 + 20 : 0),
          gap: 22,
        }}
      >
        {voting ? (
          <Voting state={state} plan={plan} today={view.today} me={me} send={send} />
        ) : (
          <Overview state={state} plan={plan} today={view.today} me={me} send={send} />
        )}
        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          <Rsvp seed={seed} me={me} send={send} />
          <Button
            label={t('plans.plan.replies')}
            kind="secondary"
            size="medium"
            onPress={() => router.push({ pathname: '/seedbed/replies', params })}
          />
        </View>
      </ScrollView>
      {bottom ? (
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: offset }}>
          {onTheDay ? (
            <Button
              label={t('plans.plan.toTheFire')}
              kind="go"
              onPress={() => router.push({ pathname: '/plans-hangout', params })}
            />
          ) : (
            <Button
              label={t('plans.vote.settle', { weekday: settle ? weekdayName(t, settle) : '' })}
              kind="go"
              haptic="success"
              onPress={() => void send('seed_changed', { seed: seed.seq, settleOn: settle })}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}
